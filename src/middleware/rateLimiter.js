const rateLimit = require('express-rate-limit')
const config    = require('../config')

const defaultLimiter = rateLimit({
  windowMs: config.RATE_LIMIT.windowMs,
  max:      config.RATE_LIMIT.max,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests, please slow down.' },
})

// Stricter limiter for auth endpoint
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      20,
  message:  { error: 'Too many auth attempts.' },
})

// Stricter for purchases
const purchaseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      10,
  message:  { error: 'Too many purchase requests.' },
})

module.exports = { defaultLimiter, authLimiter, purchaseLimiter }
