const config = require('../config')

function errorHandler(err, req, res, next) {
  console.error('[Error]', err.message)
  if (config.IS_DEV) console.error(err.stack)

  const status  = err.status || err.statusCode || 500
  const message = config.IS_DEV ? err.message : 'Internal server error'

  res.status(status).json({ error: message })
}

function notFound(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` })
}

module.exports = { errorHandler, notFound }
