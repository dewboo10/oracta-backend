'use strict'

/**
 * ORACTA Backend — Entry Point
 * Sets up Express, all middleware, routes, background jobs, and starts server.
 */

require('dotenv').config()

const express = require('express')
const cors    = require('cors')
const helmet  = require('helmet')
const morgan  = require('morgan')

const config  = require('./config')
const db      = require('./models/db')
const game    = require('./services/game')

const { defaultLimiter }         = require('./middleware/rateLimiter')
const { errorHandler, notFound } = require('./middleware/errorHandler')

// Routes
const healthRouter      = require('./routes/health')
const authRouter        = require('./routes/auth')
const userRouter        = require('./routes/user')
const storeRouter       = require('./routes/store')
const leaderboardRouter = require('./routes/leaderboard')
const referRouter       = require('./routes/refer')

const app = express()

/* ─────────────────────────────────────────────────────────────
   Security headers
───────────────────────────────────────────────────────────── */
app.use(helmet({
  crossOriginEmbedderPolicy: false, // needed for Telegram iframes
  contentSecurityPolicy:     false,
}))

/* ─────────────────────────────────────────────────────────────
   CORS
───────────────────────────────────────────────────────────── */
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Telegram WebView, etc.)
    if (!origin) return callback(null, true)
    const allowed = [
      ...config.CORS_ORIGINS,
      'https://web.telegram.org',
      'https://telegram.org',
    ]
    if (config.IS_DEV || allowed.includes(origin)) {
      return callback(null, true)
    }
    callback(new Error(`CORS: origin ${origin} not allowed`))
  },
  methods:        ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials:    true,
}))

/* ─────────────────────────────────────────────────────────────
   Body parsing & logging
───────────────────────────────────────────────────────────── */
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))

app.use(morgan(config.IS_DEV ? 'dev' : 'combined', {
  skip: (req) => req.path === '/api/health/ping',
}))

/* ─────────────────────────────────────────────────────────────
   Global rate limit
───────────────────────────────────────────────────────────── */
app.use('/api/', defaultLimiter)

/* ─────────────────────────────────────────────────────────────
   Routes
───────────────────────────────────────────────────────────── */
app.use('/api/health',      healthRouter)
app.use('/api/auth',        authRouter)
app.use('/api/user',        userRouter)
app.use('/api/store',       storeRouter)
app.use('/api/leaderboard', leaderboardRouter)
app.use('/api/refer',       referRouter)

// Root info
app.get('/', (req, res) => {
  res.json({ name: 'ORACTA API', version: '2.0.0', status: 'running' })
})

/* ─────────────────────────────────────────────────────────────
   404 + Error handler (must be last)
───────────────────────────────────────────────────────────── */
app.use(notFound)
app.use(errorHandler)

/* ─────────────────────────────────────────────────────────────
   Background jobs
───────────────────────────────────────────────────────────── */

// Auto-mine server-side tick: credits OCT to all users with active auto-mine
// Runs every 60 seconds
setInterval(() => {
  const result = game.processAutoMine()
  if (result.processed > 0) {
    console.log(`[AutoMine] Ticked ${result.processed} active auto-mine users`)
    db.save()
  }
}, 60 * 1000)

/* ─────────────────────────────────────────────────────────────
   Start server
───────────────────────────────────────────────────────────── */
const server = app.listen(config.PORT, () => {
  const pad = (s) => String(s).padEnd(28)
  console.log(`
╔══════════════════════════════════════════╗
║          ORACTA BACKEND v2.0             ║
╠══════════════════════════════════════════╣
║  Port    : ${pad(config.PORT)}║
║  Env     : ${pad(config.NODE_ENV)}║
║  Dev mode: ${pad(config.IS_DEV)}║
║  Auth    : ${pad(config.BOT_TOKEN === 'dev_token' ? '⚠️  DEV (no validation)' : '✅ Real bot token')}║
╠══════════════════════════════════════════╣
║  GET  /api/health                        ║
║  GET  /api/health/ping                   ║
║  POST /api/auth/telegram                 ║
║  GET  /api/auth/me                       ║
║  GET  /api/user/profile                  ║
║  POST /api/user/sync                     ║
║  POST /api/user/upgrade                  ║
║  POST /api/user/mission/claim            ║
║  POST /api/user/referral/apply           ║
║  GET  /api/user/referrals                ║
║  POST /api/user/session/start            ║
║  POST /api/user/session/end              ║
║  GET  /api/store/items                   ║
║  POST /api/store/invoice                 ║
║  POST /api/store/confirm                 ║
║  GET  /api/store/purchases               ║
║  POST /api/store/webhook                 ║
║  GET  /api/leaderboard                   ║
║  GET  /api/leaderboard/rank/:userId      ║
║  GET  /api/refer/code                    ║
║  POST /api/refer/apply                   ║
║  GET  /api/refer/friends                 ║
╚══════════════════════════════════════════╝
`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.PORT} is already in use`)
    process.exit(1)
  }
  throw err
})

// Graceful shutdown — save data before exit
process.on('SIGTERM', () => {
  console.log('SIGTERM — saving data and shutting down...')
  db.save()
  server.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  console.log('SIGINT — saving data and shutting down...')
  db.save()
  server.close(() => process.exit(0))
})

module.exports = { app, server }
