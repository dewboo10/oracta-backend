const { validateInitData } = require('../services/telegram')
const db = require('../models/db')
const config = require('../config')

/**
 * requireAuth middleware
 * Validates Telegram initData from Authorization header or body.
 * Sets req.userId and req.user on success.
 */
function requireAuth(req, res, next) {
  // In dev mode with no token, allow through with demo user
  if (config.IS_DEV && config.BOT_TOKEN === 'dev_token') {
    req.userId = req.params.id || req.body.userId || 'dev_user'
    req.user   = db.getOrCreateUser(req.userId, { first_name: 'Dev User' })
    return next()
  }

  // Get initData from header or body
  const authHeader = req.headers.authorization || ''
  const initData   = authHeader.replace('tma ', '').replace('TMA ', '').trim()
    || req.body.initData
    || req.query.initData

  if (!initData) {
    return res.status(401).json({ error: 'Missing authorization' })
  }

  const result = validateInitData(initData)
  if (!result.valid) {
    return res.status(401).json({ error: result.error || 'Invalid auth' })
  }

  req.userId   = result.userId
  req.telegramData = result.data
  req.user     = db.getOrCreateUser(req.userId, result.data)
  next()
}

/**
 * optionalAuth — sets req.user if valid, continues either way
 */
function optionalAuth(req, res, next) {
  if (config.IS_DEV) {
    req.userId = 'dev_user'
    req.user   = db.getOrCreateUser('dev_user', { first_name: 'Dev User' })
    return next()
  }

  const authHeader = req.headers.authorization || ''
  const initData   = authHeader.replace('tma ', '').trim()

  if (initData) {
    const result = validateInitData(initData)
    if (result.valid) {
      req.userId = result.userId
      req.user   = db.getOrCreateUser(req.userId, result.data)
    }
  }
  next()
}

module.exports = { requireAuth, optionalAuth }
