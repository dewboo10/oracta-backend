'use strict'

/**
 * ORACTA Referral Routes
 * GET  /api/refer/code       — get/generate your referral code
 * POST /api/refer/apply      — apply a code on first join
 * GET  /api/refer/friends    — list your referred friends
 */

const router = require('express').Router()
const db     = require('../models/db')
const game   = require('../services/game')
const { requireAuth } = require('../middleware/auth')
const { sanitizeUser } = require('./auth')

router.use(requireAuth)

/**
 * GET /api/refer/code
 * Returns the authenticated user's referral code and referral count.
 */
router.get('/code', (req, res) => {
  const user = req.user
  res.json({
    ok:        true,
    code:      user.referralCode,
    totalRefs: user.refs || 0,
    bonusPerRef: 5000,
  })
})

/**
 * POST /api/refer/apply
 * Body: { code: string }
 * Applies a referral code (one-time only). Credits both parties.
 */
router.post('/apply', (req, res) => {
  const { code } = req.body
  if (!code) return res.status(400).json({ ok: false, error: 'code required' })

  const result = game.applyReferral(req.user, code)
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error })
  }

  res.json({
    ok:             true,
    newUserBonus:   result.newUserBonus,
    referrerBonus:  result.referrerBonus,
    user:           sanitizeUser(req.user),
  })
})

/**
 * GET /api/refer/friends
 * Returns list of users referred by the current user.
 */
router.get('/friends', (req, res) => {
  const friends = db.getAllUsers()
    .filter(u => u.referredBy === req.userId)
    .map(u => ({
      id:         u.id,
      username:   u.username || u.firstName || `Miner_${u.id.slice(-4)}`,
      totalMined: u.totalMined,
      lastSeen:   u.lastSeen,
      mining:     u.autoMineUntil
        ? (u.autoMineUntil === Infinity || u.autoMineUntil > Date.now())
        : false,
    }))

  res.json({ ok: true, friends, count: friends.length })
})

module.exports = router
