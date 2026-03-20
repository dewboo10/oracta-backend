const router = require('express').Router()
const db     = require('../models/db')
const { optionalAuth } = require('../middleware/auth')

/**
 * GET /api/leaderboard
 * Query: ?limit=100&offset=0
 * Public — returns top miners.
 * If authenticated, includes caller's rank.
 */
router.get('/', optionalAuth, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  || '100'), 500)
  const offset = parseInt(req.query.offset || '0')

  const allBoard = await db.getLeaderboard(limit + offset)
  const board = allBoard.slice(offset, offset + limit)  
  let myRank = null
  
  if (req.userId) {
    const allSorted = await db.getLeaderboard(10000)
    const idx = allSorted.findIndex(u => u.id === req.userId)
    if (idx !== -1) {
      myRank = {
        rank:       allSorted[idx].rank,
        totalMined: allSorted[idx].totalMined,
      }
    }
  }

  res.json({
    ok: true,
    leaderboard: board,
    myRank,
    total: db.getAllUsers().length,
  })
})

/**
 * GET /api/leaderboard/rank/:userId
 * Returns a specific user's rank.
 */
router.get('/rank/:userId', (req, res) => {
  const all = db.getLeaderboard(10000)
  const entry = all.find(u => u.id === req.params.userId)
  if (!entry) return res.status(404).json({ ok: false, error: 'User not found' })
  res.json({ ok: true, ...entry })
})

module.exports = router
