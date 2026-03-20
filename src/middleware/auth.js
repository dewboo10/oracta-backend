const { validateInitData } = require('../services/telegram')
const db     = require('../models/db')
const config = require('../config')

async function requireAuth(req, res, next) {
  if (config.IS_DEV) {
    const authHeader = req.headers.authorization || ''
    const initData   = authHeader.startsWith('tma ') ? authHeader.slice(4).trim() : ''
    const userId     = initData || 'dev_user'
    req.userId = userId
    req.user   = await db.getOrCreateUser(userId, { first_name: 'Dev User' })
    return next()
  }

  const authHeader = req.headers.authorization || ''
  const initData   = authHeader.startsWith('tma ') ? authHeader.slice(4).trim() : ''
    || req.body?.initData
    || req.query?.initData

  if (!initData) return res.status(401).json({ error: 'Missing authorization' })

  const result = validateInitData(initData)
  if (!result.valid) return res.status(401).json({ error: result.error || 'Invalid auth' })

  req.userId = result.userId
  req.user   = await db.getOrCreateUser(req.userId, result.data)
  next()
}

async function optionalAuth(req, res, next) {
  if (config.IS_DEV) {
    req.userId = 'dev_user'
    req.user   = await db.getOrCreateUser('dev_user', { first_name: 'Dev User' })
    return next()
  }
  const authHeader = req.headers.authorization || ''
  const initData   = authHeader.startsWith('tma ') ? authHeader.slice(4).trim() : ''
  if (initData) {
    const result = validateInitData(initData)
    if (result.valid) {
      req.userId = result.userId
      req.user   = await db.getOrCreateUser(req.userId, result.data)
    }
  }
  next()
}

module.exports = { requireAuth, optionalAuth }