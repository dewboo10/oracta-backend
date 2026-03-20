const router = require('express').Router()
const db     = require('../models/db')
const game   = require('../services/game')
const { requireAuth } = require('../middleware/auth')
const { sanitizeUser } = require('./auth')

/* All user routes require auth */
router.use(requireAuth)

/**
 * GET /api/user/profile
 * Returns the authenticated user's full profile.
 */
router.get('/profile', (req, res) => {
  res.json({ ok: true, user: sanitizeUser(req.user) })
})

/**
 * POST /api/user/sync
 * Body: { balance, totalMined, blocks, upgrades, sessE, sessT }
 *
 * Called at end of a mining session or when app goes to background.
 * Syncs client state to server.
 */
router.post('/sync', async(req, res) => {
  const { balance, totalMined, blocks, upgrades, sessE, sessT } = req.body
  const result = game.syncSession(req.user, { balance, totalMined, blocks, upgrades, sessE, sessT })

  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error })
  }

    await db.updateUser(req.userId, {
    balance:      req.user.balance,
    total_mined:  req.user.totalMined,
    blocks:       req.user.blocks,
    upgrades:     req.user.upgrades,
  })

  res.json({ ok: true, user: sanitizeUser(req.user) })
})

/**
 * POST /api/user/upgrade
 * Body: { upgradeId: number }
 *
 * Purchases one level of an upgrade using OCT balance.
 */
router.post('/upgrade', async (req, res) => {
  const upgradeId = parseInt(req.body.upgradeId)
  if (!upgradeId) return res.status(400).json({ ok: false, error: 'upgradeId required' })

  const result = game.applyUpgrade(req.user, upgradeId)
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error })
  }

    await db.updateUser(req.userId, {
    balance:  req.user.balance,
    upgrades: req.user.upgrades,
  })

  res.json({
    ok:         true,
    cost:       result.cost,
    newLevel:   result.newLevel,
    newBalance: result.newBalance,
    user:       sanitizeUser(req.user),
  })
})

/**
 * POST /api/user/mission/claim
 * Body: { missionId: string, cpIndex: number }
 *
 * Claims a mission checkpoint reward.
 */
router.post('/mission/claim', async (req, res) => {
  const { missionId, cpIndex } = req.body
  if (!missionId || cpIndex === undefined) {
    return res.status(400).json({ ok: false, error: 'missionId and cpIndex required' })
  }

  const result = game.claimCheckpoint(req.user, missionId, parseInt(cpIndex))
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error })
  }


  await db.updateUser(req.userId, {
    balance:  req.user.balance,
    m_points: req.user.mPoints,
    claimed:  req.user.claimed,
  })
  
  res.json({
    ok:         true,
    reward:     result.reward,
    newBalance: result.newBalance,
    user:       sanitizeUser(req.user),
  })
})

/**
 * POST /api/user/referral/apply
 * Body: { code: string }
 *
 * Applies a referral code (one-time, first login only).
 */
router.post('/referral/apply', async (req, res) => {
  const { code } = req.body
  if (!code) return res.status(400).json({ ok: false, error: 'code required' })

  const result = game.applyReferral(req.user, code)
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error })
  }

    await db.updateUser(req.userId, {
    balance:     req.user.balance,
    total_mined: req.user.totalMined,
    referred_by: req.user.referredBy,
  })

  res.json({
    ok:           true,
    newUserBonus: result.newUserBonus,
    user:         sanitizeUser(req.user),
  })
})

/**
 * GET /api/user/referrals
 * Returns the user's referred friends list.
 */
router.get('/referrals',  async (req, res) => {
  const friends = await db.getAllUsers()
    .filter(u => u.referredBy === req.userId)
    .map(u => ({
      id:         u.id,
      username:   u.username || u.firstName,
      totalMined: u.totalMined,
      lastSeen:   u.lastSeen,
    }))

  res.json({ ok: true, friends, count: friends.length })
})

/**
 * POST /api/user/session/start
 * Registers start of a mining session.
 * Returns: { sessionId }
 */
router.post('/session/start', async (req, res) => {
   const session = await db.createSession(req.userId)
   if (!session) return res.status(500).json({ error: 'Failed to create session' })
   res.json({ ok: true, sessionId: session.id })
})

/**
 * POST /api/user/session/end
 * Body: { sessionId, earned, blocks }
 * Closes out a session, updates user playtime.
 */
router.post('/session/end',  async (req, res) => {
  const { sessionId, earned, blocks } = req.body
  if (!sessionId) return res.status(400).json({ ok: false, error: 'sessionId required' })

  const session = await db.endSession(sessionId, earned || 0, blocks || 0)
  if (!session) return res.status(404).json({ ok: false, error: 'Session not found' })

  res.json({ ok: true, session })
})

module.exports = router
