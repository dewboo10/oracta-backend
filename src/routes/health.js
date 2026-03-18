const router = require('express').Router()
const db     = require('../models/db')
const config = require('../config')

/**
 * GET /api/health
 * Health check — used by monitoring, load balancers.
 */
router.get('/', (req, res) => {
  res.json({
    ok:          true,
    status:      'healthy',
    version:     '2.0.0',
    env:         config.NODE_ENV,
    timestamp:   Date.now(),
    uptime:      Math.floor(process.uptime()),
    users:       db.getAllUsers().length,
    memory:      process.memoryUsage().heapUsed,
  })
})

/**
 * GET /api/health/ping
 * Minimal ping.
 */
router.get('/ping', (req, res) => {
  res.json({ ok: true, pong: Date.now() })
})

module.exports = router
