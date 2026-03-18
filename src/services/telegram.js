/**
 * Telegram Mini App Auth & Stars Payment Service
 */

const crypto = require('crypto')
const config = require('../config')

/**
 * Validates Telegram Mini App initData HMAC.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function validateInitData(initData) {
  if (config.IS_DEV && (config.BOT_TOKEN === 'dev_token' || !initData)) {
    return { valid: true, data: {}, userId: 'dev_user' }
  }

  try {
    const params      = new URLSearchParams(initData)
    const receivedHash = params.get('hash')
    if (!receivedHash) return { valid: false, error: 'No hash' }

    params.delete('hash')

    // Build check string: sorted key=value pairs joined by \n
    const checkString = [...params.keys()]
      .sort()
      .map(k => `${k}=${params.get(k)}`)
      .join('\n')

    // HMAC-SHA256 with secret key = HMAC-SHA256("WebAppData", BOT_TOKEN)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(config.BOT_TOKEN)
      .digest()

    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex')

    if (computedHash !== receivedHash) {
      return { valid: false, error: 'Hash mismatch' }
    }

    // Check auth_date is not too old (24h)
    const authDate = parseInt(params.get('auth_date') || '0')
    const age      = Math.floor(Date.now() / 1000) - authDate
    if (age > 86400) {
      return { valid: false, error: 'initData expired' }
    }

    // Parse user
    let userData = {}
    try {
      userData = JSON.parse(decodeURIComponent(params.get('user') || '{}'))
    } catch (_) {}

    return {
      valid:  true,
      data:   userData,
      userId: String(userData.id || 'unknown'),
    }
  } catch (err) {
    return { valid: false, error: err.message }
  }
}

/**
 * Validates a Telegram Stars payment.
 * After payment completes, Telegram sends a pre_checkout_query / successful_payment
 * to your bot webhook. This function verifies the payload matches what we expect.
 *
 * In production you call:
 *   POST https://api.telegram.org/bot<TOKEN>/answerPreCheckoutQuery
 * from your webhook handler.
 *
 * For the REST API flow (invoice from frontend), you just verify the
 * telegram_payment_charge_id was actually issued by Telegram.
 */
function verifyStarsPayment(payload) {
  // payload from Telegram successful_payment:
  // { currency, total_amount, invoice_payload, telegram_payment_charge_id, provider_payment_charge_id }
  if (!payload || payload.currency !== 'XTR') {
    return { valid: false, error: 'Invalid currency (must be XTR for Stars)' }
  }
  if (!payload.telegram_payment_charge_id) {
    return { valid: false, error: 'Missing charge id' }
  }
  return {
    valid:    true,
    chargeId: payload.telegram_payment_charge_id,
    stars:    payload.total_amount,
    itemId:   payload.invoice_payload,
  }
}

/**
 * Build a Telegram Stars invoice link via Bot API.
 * Call this from your server to generate a payment link for the frontend.
 *
 * Returns the invoice_link string you pass to
 *   window.Telegram.WebApp.openInvoice(link)
 * on the frontend.
 */
async function createInvoiceLink(itemId, title, description, stars) {
  const url    = `https://api.telegram.org/bot${config.BOT_TOKEN}/createInvoiceLink`
  const body   = {
    title,
    description,
    payload:   itemId,
    currency:  'XTR',
    prices:    [{ label: title, amount: stars }],
  }

  // Only call if we have a real bot token
  if (config.IS_DEV || config.BOT_TOKEN === 'dev_token') {
    console.log('[Telegram] DEV MODE — mock invoice link for', itemId, stars, 'stars')
    return { ok: true, result: `https://t.me/invoice/mock_${itemId}_${stars}` }
  }

  try {
    const res  = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    return await res.json()
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * Answer a pre-checkout query from Telegram.
 * Must be called within 10 seconds of receiving the pre_checkout_query webhook.
 */
async function answerPreCheckoutQuery(preCheckoutQueryId, ok = true, errorMessage = null) {
  const url  = `https://api.telegram.org/bot${config.BOT_TOKEN}/answerPreCheckoutQuery`
  const body = { pre_checkout_query_id: preCheckoutQueryId, ok }
  if (!ok && errorMessage) body.error_message = errorMessage

  if (config.IS_DEV) {
    console.log('[Telegram] DEV MODE — answerPreCheckoutQuery', preCheckoutQueryId, ok)
    return { ok: true }
  }

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    return await res.json()
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

module.exports = {
  validateInitData,
  verifyStarsPayment,
  createInvoiceLink,
  answerPreCheckoutQuery,
}
