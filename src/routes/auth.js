const router   = require('express').Router()
const db       = require('../models/db')
const telegram = require('../services/telegram')
const game     = require('../services/game')
const { authLimiter } = require('../middleware/rateLimiter')

/**
 * POST /api/auth/telegram
 * Body: { initData: string, referralCode?: string }
 *
 * Validates Telegram Mini App initData.
 * Creates or fetches user. Applies referral if first time.
 * Returns: { ok, userId, user, token? }
 */
router.post('/telegram', authLimiter, (req, res) => {
  const { initData, referralCode } = req.body

  const result = telegram.validateInitData(initData)
  if (!result.valid) {
    return res.status(401).json({ ok: false, error: result.error })
  }

  const isNew = !db.getUser(result.userId)
  const user  = db.getOrCreateUser(result.userId, result.data)

  // Apply referral on first join
  if (isNew && referralCode && referralCode !== user.referralCode) {
    const refResult = game.applyReferral(user, referralCode)
    if (refResult.ok) {
      console.log(`[Referral] ${result.userId} referred by code ${referralCode}`)
    }
  }

  // Update streak
  game.updateStreak(user)

  res.json({
    ok:     true,
    userId: result.userId,
    isNew,
    user:   sanitizeUser(user),
  })
})

/**
 * GET /api/auth/me
 * Header: Authorization: tma <initData>
 * Returns current user profile.
 */
router.get('/me', (req, res) => {
  const { requireAuth } = require('../middleware/auth')
  requireAuth(req, res, () => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Not authenticated' })
    res.json({ ok: true, user: sanitizeUser(req.user) })
  })
})

function sanitizeUser(user) {
  return {
    id:            user.id,
    username:      user.username,
    firstName:     user.firstName,
    balance:       user.balance,
    totalMined:    user.totalMined,
    blocks:        user.blocks,
    upgrades:      user.upgrades,
    purchased:     user.purchased,
    autoMineUntil: user.autoMineUntil,
    refs:          user.refs,
    referralCode:  user.referralCode,
    mPoints:       user.mPoints,
    claimed:       user.claimed,
    streak:        user.streak,
    achievements:  user.achievements,
    createdAt:     user.createdAt,
    lastSeen:      user.lastSeen,
    totalSessions: user.totalSessions,
    totalPlaytime: user.totalPlaytime,
  }
}

module.exports = router
module.exports.sanitizeUser = sanitizeUser
