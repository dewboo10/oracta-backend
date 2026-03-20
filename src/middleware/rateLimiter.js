const rateLimit = require('express-rate-limit')
const config    = require('../config')

const keyGenerator = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip

const defaultLimiter = rateLimit({
  windowMs: config.RATE_LIMIT.windowMs,
  max:      config.RATE_LIMIT.max,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator,
  message: { error: 'Too many requests, please slow down.' },
})

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      20,
  keyGenerator,
  message:  { error: 'Too many auth attempts.' },
})

const purchaseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      10,
  keyGenerator,
  message:  { error: 'Too many purchase requests.' },
})

module.exports = { defaultLimiter, authLimiter, purchaseLimiter }