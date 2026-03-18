const router   = require('express').Router()
const config   = require('../config')
const db       = require('../models/db')
const game     = require('../services/game')
const telegram = require('../services/telegram')
const { requireAuth }     = require('../middleware/auth')
const { purchaseLimiter } = require('../middleware/rateLimiter')
const { sanitizeUser }    = require('./auth')

/**
 * GET /api/store/items
 * Returns all available store items with Stars prices.
 * Public endpoint — no auth needed.
 */
router.get('/items', (req, res) => {
  const items = [
    {
      id: 'auto_24h', category: 'automine', name: 'Auto-Mine 24H',
      icon: '⚡', stars: 75, tag: 'POPULAR', badge: '24H OFFLINE',
      desc: 'Mine automatically for 24 hours even when closed.',
      features: ['Mines while offline','2× rate boost','Auto-collects blocks','Activates immediately'],
      color: '#e8b84b', autoMineHours: 24,
    },
    {
      id: 'auto_7d', category: 'automine', name: 'Auto-Mine 7 Days',
      icon: '🔋', stars: 299, tag: 'VALUE', badge: '7D OFFLINE',
      desc: '7-day continuous mining — never miss earnings.',
      features: ['7 days offline mining','3× rate boost','Priority block discovery','Mining report'],
      color: '#5ec98a', autoMineHours: 168,
    },
    {
      id: 'auto_30d', category: 'automine', name: 'Auto-Mine 30D',
      icon: '◎', stars: 899, tag: 'BEST', badge: '30D OFFLINE',
      desc: 'A full month of passive OCT mining.',
      features: ['30 days offline mining','5× rate boost','Exclusive 30D badge','Block bonus ×2'],
      color: '#5ba8e8', autoMineHours: 720,
    },
    {
      id: 'auto_life', category: 'automine', name: 'Lifetime Auto-Mine',
      icon: '✦', stars: 2499, tag: 'LIFETIME', badge: 'FOREVER',
      desc: 'One purchase. Mine forever — even with the app closed.',
      features: ['Permanent offline mining','10× rate multiplier','Genesis badge on-chain','OG holder recognition','All future bonuses','Top-100 guaranteed'],
      color: '#c07cf0', autoMineHours: -1, featured: true,
    },
    {
      id: 'boost_3x', category: 'boosts', name: 'Turbo Pack',
      icon: '🚀', stars: 49, tag: 'HOT', badge: '3× · 1 HOUR',
      desc: 'Triple your OCT mining rate for a full hour.',
      features: ['3× mining speed','60 min duration','Stacks with upgrades','Works with auto-mine'],
      color: '#e8b84b',
    },
    {
      id: 'boost_10x', category: 'boosts', name: 'Surge Pack',
      icon: '⚡', stars: 149, tag: 'POWER', badge: '10× · 2 HOURS',
      desc: '10× speed surge for 2 hours. Maximum earnings.',
      features: ['10× mining speed','2 hour duration','Block discovery ×3','Surge badge'],
      color: '#c07cf0',
    },
    {
      id: 'chest_s', category: 'coins', name: 'OCT Chest S',
      icon: '📦', stars: 99, badge: '10,000 OCT',
      desc: 'Instantly adds 10,000 OCT to your balance.',
      features: ['10,000 OCT instant','No expiry','Leaderboard eligible','Tradeable at listing'],
      color: '#e8b84b', octReward: 10000,
    },
    {
      id: 'chest_m', category: 'coins', name: 'OCT Chest M',
      icon: '📦', stars: 249, tag: 'VALUE', badge: '50,000 OCT',
      desc: '50,000 OCT credited instantly.',
      features: ['50,000 OCT instant','No expiry','Leaderboard eligible','Tradeable at listing'],
      color: '#e8b84b', octReward: 50000,
    },
    {
      id: 'chest_xl', category: 'coins', name: 'OCT Chest XL',
      icon: '📦', stars: 599, tag: 'BEST', badge: '200,000 OCT',
      desc: '200,000 OCT — fastest path to leaderboard.',
      features: ['200,000 OCT instant','No expiry','Top-100 push','Tradeable at listing'],
      color: '#e8b84b', octReward: 200000,
    },
  ]
  res.json({ ok: true, items })
})

/**
 * POST /api/store/invoice
 * Body: { itemId }
 * Auth: required
 *
 * Creates a Telegram Stars invoice link.
 * Frontend uses the returned link to call WebApp.openInvoice(link).
 */
router.post('/invoice', requireAuth, purchaseLimiter, async (req, res) => {
  const { itemId } = req.body
  if (!itemId) return res.status(400).json({ ok: false, error: 'itemId required' })

  const catalogItem = config.STORE_ITEMS.find(x => x.id === itemId)
  if (!catalogItem)  return res.status(404).json({ ok: false, error: 'Item not found' })

  // Get full item details from store listing
  const storeItems = await getStoreItems()
  const item = storeItems.find(x => x.id === itemId)

  const result = await telegram.createInvoiceLink(
    itemId,
    item?.name || itemId,
    item?.desc || '',
    catalogItem.stars
  )

  if (!result.ok) {
    return res.status(500).json({ ok: false, error: result.error || 'Invoice creation failed' })
  }

  res.json({ ok: true, invoiceLink: result.result, stars: catalogItem.stars })
})

/**
 * POST /api/store/confirm
 * Body: { itemId, telegramPaymentChargeId, stars }
 * Auth: required
 *
 * Called after a successful Telegram Stars payment.
 * In production, verify the payment via Telegram's API before crediting.
 */
router.post('/confirm', requireAuth, purchaseLimiter, (req, res) => {
  const { itemId, telegramPaymentChargeId, stars } = req.body
  if (!itemId) return res.status(400).json({ ok: false, error: 'itemId required' })

  const catalogItem = config.STORE_ITEMS.find(x => x.id === itemId)
  if (!catalogItem)  return res.status(404).json({ ok: false, error: 'Item not found' })

  // In production: verify telegramPaymentChargeId with Telegram Bot API
  // For now: trust in dev, require in production
  if (!config.IS_DEV && !telegramPaymentChargeId) {
    return res.status(400).json({ ok: false, error: 'Payment charge ID required' })
  }

  // Record purchase
  db.recordPurchase(req.userId, itemId, catalogItem.stars, telegramPaymentChargeId)

  // Apply to game state
  const result = game.applyPurchase(req.user, itemId)
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error })
  }

  console.log(`[Purchase] User ${req.userId} bought ${itemId} for ${catalogItem.stars} Stars`)

  res.json({
    ok:       true,
    itemId,
    stars:    catalogItem.stars,
    user:     sanitizeUser(req.user),
  })
})

/**
 * GET /api/store/purchases
 * Auth: required
 * Returns the authenticated user's purchase history.
 */
router.get('/purchases', requireAuth, (req, res) => {
  const history = db.getUserPurchases(req.userId)
  res.json({ ok: true, purchases: history })
})

/* ── Telegram Webhook (pre_checkout_query + successful_payment) ── */

/**
 * POST /api/store/webhook
 * Receives Telegram bot webhook updates.
 * Handles:
 *   - pre_checkout_query: answer OK to proceed
 *   - message.successful_payment: credit the user
 *
 * Set your bot webhook to: https://your-server.com/api/store/webhook
 */
router.post('/webhook', async (req, res) => {
  // Always respond 200 immediately to Telegram
  res.json({ ok: true })

  const update = req.body
  if (!update) return

  // Handle pre_checkout_query — must answer within 10 seconds
  if (update.pre_checkout_query) {
    const pcq = update.pre_checkout_query
    console.log(`[Webhook] pre_checkout_query ${pcq.id} from user ${pcq.from.id} for ${pcq.invoice_payload}`)

    const catalogItem = config.STORE_ITEMS.find(x => x.id === pcq.invoice_payload)
    if (!catalogItem || catalogItem.stars !== pcq.total_amount) {
      await telegram.answerPreCheckoutQuery(pcq.id, false, 'Invalid item or price')
      return
    }
    await telegram.answerPreCheckoutQuery(pcq.id, true)
    return
  }

  // Handle successful_payment
  if (update.message?.successful_payment) {
    const payment = update.message.successful_payment
    const userId  = String(update.message.from.id)
    console.log(`[Webhook] successful_payment from ${userId}: ${payment.invoice_payload} (${payment.total_amount} stars)`)

    const user = db.getOrCreateUser(userId)
    const verification = telegram.verifyStarsPayment({
      currency:                    payment.currency,
      total_amount:                payment.total_amount,
      invoice_payload:             payment.invoice_payload,
      telegram_payment_charge_id:  payment.telegram_payment_charge_id,
      provider_payment_charge_id:  payment.provider_payment_charge_id,
    })

    if (!verification.valid) {
      console.error('[Webhook] Payment verification failed:', verification.error)
      return
    }

    db.recordPurchase(userId, payment.invoice_payload, payment.total_amount, payment.telegram_payment_charge_id)
    game.applyPurchase(user, payment.invoice_payload)
    console.log(`[Webhook] Credited ${payment.invoice_payload} to user ${userId}`)
  }
})

async function getStoreItems() {
  return config.STORE_ITEMS
}

module.exports = router
