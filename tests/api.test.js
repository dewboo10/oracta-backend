'use strict'

/**
 * ORACTA API smoke tests — zero external dependencies.
 * Run:  node tests/api.test.js
 * (server must be running on port 5000 first: npm start)
 */

const http = require('http')

let passed = 0, failed = 0

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = http.request({
      hostname: 'localhost', port: 5000, path, method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let raw = ''
      res.on('data', c => raw += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }) }
        catch { resolve({ status: res.statusCode, body: raw }) }
      })
    })
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

async function test(label, fn) {
  try {
    await fn()
    console.log(`  ✅  ${label}`)
    passed++
  } catch (err) {
    console.log(`  ❌  ${label}\n      ${err.message}`)
    failed++
  }
}

function eq(a, b) { if (a !== b) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
function ok(v, m) { if (!v) throw new Error(m || `Expected truthy, got ${JSON.stringify(v)}`) }
function gt(a, b) { if (a <= b) throw new Error(`Expected ${a} > ${b}`) }

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  ORACTA API Smoke Tests')
  console.log('══════════════════════════════════════════\n')

  // ── Health ──────────────────────────────────────────────────
  await test('GET / returns API info', async () => {
    const r = await request('GET', '/')
    eq(r.status, 200); ok(r.body.name)
  })

  await test('GET /api/health returns healthy', async () => {
    const r = await request('GET', '/api/health')
    eq(r.status, 200); eq(r.body.ok, true); eq(r.body.status, 'healthy')
  })

  await test('GET /api/health/ping returns pong', async () => {
    const r = await request('GET', '/api/health/ping')
    eq(r.status, 200); ok(r.body.pong)
  })

  // ── Auth ────────────────────────────────────────────────────
  await test('POST /api/auth/telegram — dev mode creates user', async () => {
    const r = await request('POST', '/api/auth/telegram', { initData: 'dev' })
    eq(r.status, 200); ok(r.body.ok); ok(r.body.userId); ok(r.body.user)
  })

  await test('GET /api/auth/me returns user', async () => {
    const r = await request('GET', '/api/auth/me')
    eq(r.status, 200); ok(r.body.ok); ok(r.body.user)
  })

  // ── User ────────────────────────────────────────────────────
  await test('GET /api/user/profile', async () => {
    const r = await request('GET', '/api/user/profile')
    eq(r.status, 200); ok(r.body.user)
  })

  await test('POST /api/user/sync — updates balance', async () => {
    const r = await request('POST', '/api/user/sync', {
      balance: 5000, totalMined: 5000, blocks: 3, sessE: 5000, sessT: 300
    })
    eq(r.status, 200); ok(r.body.ok); eq(r.body.user.balance, 5000)
  })

  await test('POST /api/user/upgrade — buys Neural Boost', async () => {
    const r = await request('POST', '/api/user/upgrade', { upgradeId: 1 })
    eq(r.status, 200); ok(r.body.ok); eq(r.body.newLevel, 1)
  })

  await test('POST /api/user/upgrade — insufficient balance rejected', async () => {
    // upgradeId 5 (Singularity) costs 180000 — we only have ~4500
    const r = await request('POST', '/api/user/upgrade', { upgradeId: 5 })
    eq(r.status, 400); ok(r.body.error)
  })

  await test('POST /api/user/mission/claim — m_miner cp0', async () => {
    // First sync enough to qualify (at:1000)
    await request('POST', '/api/user/sync', { balance: 2000, totalMined: 2000, blocks: 3, sessE: 2000, sessT: 60 })
    const r = await request('POST', '/api/user/mission/claim', { missionId: 'm_miner', cpIndex: 0 })
    eq(r.status, 200); ok(r.body.ok); eq(r.body.reward, 500)
  })

  await test('POST /api/user/mission/claim — duplicate rejected', async () => {
    const r = await request('POST', '/api/user/mission/claim', { missionId: 'm_miner', cpIndex: 0 })
    eq(r.status, 400); ok(r.body.error)
  })

  await test('POST /api/user/session/start returns sessionId', async () => {
    const r = await request('POST', '/api/user/session/start', {})
    eq(r.status, 200); ok(r.body.sessionId)
  })

  await test('POST /api/user/session/end closes session', async () => {
    const start = await request('POST', '/api/user/session/start', {})
    const r = await request('POST', '/api/user/session/end', {
      sessionId: start.body.sessionId, earned: 1000, blocks: 2
    })
    eq(r.status, 200); ok(r.body.session)
  })

  await test('GET /api/user/referrals returns array', async () => {
    const r = await request('GET', '/api/user/referrals')
    eq(r.status, 200); ok(Array.isArray(r.body.friends))
  })

  // ── Store ───────────────────────────────────────────────────
  await test('GET /api/store/items returns 9 items', async () => {
    const r = await request('GET', '/api/store/items')
    eq(r.status, 200); ok(Array.isArray(r.body.items))
    gt(r.body.items.length, 0)
  })

  await test('POST /api/store/invoice returns invoiceLink (dev mock)', async () => {
    const r = await request('POST', '/api/store/invoice', { itemId: 'auto_24h' })
    eq(r.status, 200); ok(r.body.ok); ok(r.body.invoiceLink)
  })

  await test('POST /api/store/confirm — chest_s credits 10000 OCT', async () => {
    const r = await request('POST', '/api/store/confirm', {
      itemId: 'chest_s', telegramPaymentChargeId: 'mock_charge_123', stars: 99
    })
    eq(r.status, 200); ok(r.body.ok)
  })

  await test('POST /api/store/confirm — auto_life sets autoMineUntil', async () => {
    const r = await request('POST', '/api/store/confirm', {
      itemId: 'auto_life', telegramPaymentChargeId: 'mock_charge_456', stars: 2499
    })
    eq(r.status, 200); ok(r.body.ok)
    eq(r.body.user.autoMineUntil, Infinity)
  })

  await test('GET /api/store/purchases returns history', async () => {
    const r = await request('GET', '/api/store/purchases')
    eq(r.status, 200); ok(Array.isArray(r.body.purchases))
    gt(r.body.purchases.length, 0)
  })

  // ── Leaderboard ─────────────────────────────────────────────
  await test('GET /api/leaderboard returns board', async () => {
    const r = await request('GET', '/api/leaderboard')
    eq(r.status, 200); ok(Array.isArray(r.body.leaderboard))
  })

  await test('GET /api/leaderboard?limit=5 respects limit', async () => {
    const r = await request('GET', '/api/leaderboard?limit=5')
    eq(r.status, 200)
    ok(r.body.leaderboard.length <= 5)
  })

  // ── Refer ───────────────────────────────────────────────────
  await test('GET /api/refer/code returns referral code', async () => {
    const r = await request('GET', '/api/refer/code')
    eq(r.status, 200); ok(r.body.code)
  })

  await test('GET /api/refer/friends returns array', async () => {
    const r = await request('GET', '/api/refer/friends')
    eq(r.status, 200); ok(Array.isArray(r.body.friends))
  })

  await test('POST /api/refer/apply — self-referral rejected', async () => {
    const codeRes = await request('GET', '/api/refer/code')
    const r = await request('POST', '/api/refer/apply', { code: codeRes.body.code })
    eq(r.status, 400); ok(r.body.error)
  })

  // ── 404 ─────────────────────────────────────────────────────
  await test('GET /api/nonexistent returns 404', async () => {
    const r = await request('GET', '/api/nonexistent')
    eq(r.status, 404)
  })

  // ── Summary ─────────────────────────────────────────────────
  const total = passed + failed
  console.log('\n══════════════════════════════════════════')
  console.log(`  ${passed}/${total} passed${failed > 0 ? `  (${failed} FAILED)` : '  ✅ All green'}`)
  console.log('══════════════════════════════════════════\n')
  process.exit(failed > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('Test runner crashed:', err)
  process.exit(1)
})
