require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })

const { createClient } = require('@supabase/supabase-js')
const { v4: uuidv4 } = require('uuid')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

function generateReferralCode(seed) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'OCT-'
  const s = String(seed)
  for (let i = 0; i < 6; i++) {
    const idx = (parseInt(s[i % s.length] || '0') + i * 7) % chars.length
    code += chars[idx]
  }
  return code
}

/* ── User ── */
async function getUser(userId) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', String(userId))
    .single()
  return data || null
}

async function getOrCreateUser(telegramId, telegramData = {}) {
  const id = String(telegramId)
  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single()

  if (!user) {
    const newUser = {
      id,
      telegram_id:      id,
      username:         telegramData.username    || null,
      first_name:       telegramData.first_name  || 'Miner',
      last_name:        telegramData.last_name   || null,
      language_code:    telegramData.language_code || 'en',
      balance:          0,
      total_mined:      0,
      blocks:           0,
      upgrades:         {},
      purchased:        [],
      auto_mine_until:  null,
      refs:             0,
      referred_by:      null,
      referral_code:    generateReferralCode(id),
      m_points:         0,
      claimed:          {},
      streak:           0,
      last_streak_date: null,
      achievements:     [],
      created_at:       Date.now(),
      last_seen:        Date.now(),
      total_sessions:   0,
      total_playtime:   0,
    }
    const { data } = await supabase
      .from('users')
      .insert(newUser)
      .select()
      .single()
    user = data
  } else {
    await supabase
      .from('users')
      .update({ last_seen: Date.now() })
      .eq('id', id)
    user.last_seen = Date.now()
  }
  return user
}

async function updateUser(userId, updates) {
  const { data } = await supabase
    .from('users')
    .update(updates)
    .eq('id', String(userId))
    .select()
    .single()
  return data
}

async function getAllUsers() {
  const { data } = await supabase
    .from('users')
    .select('*')
  return data || []
}

/* ── Sessions ── */
async function createSession(userId) {
  const { data } = await supabase
    .from('sessions')
    .insert({
      id:         uuidv4(),
      user_id:    String(userId),
      started_at: Date.now(),
      ended_at:   null,
      earned:     0,
      blocks:     0,
    })
    .select()
    .single()
  return data
}

async function endSession(sessionId, earned, blocks) {
  const { data: session } = await supabase
    .from('sessions')
    .update({ ended_at: Date.now(), earned, blocks })
    .eq('id', sessionId)
    .select()
    .single()

  if (session) {
    const durationSec = Math.floor((session.ended_at - session.started_at) / 1000)
    const user = await getUser(session.user_id)
    if (user) {
      await updateUser(session.user_id, {
        total_sessions: (user.total_sessions || 0) + 1,
        total_playtime: (user.total_playtime || 0) + durationSec,
      })
    }
  }
  return session
}

/* ── Purchases ── */
async function recordPurchase(userId, itemId, stars, telegramPaymentChargeId = null) {
  const { data } = await supabase
    .from('purchases')
    .insert({
      id:                        uuidv4(),
      user_id:                   String(userId),
      item_id:                   itemId,
      stars,
      telegram_payment_charge_id: telegramPaymentChargeId,
      created_at:                Date.now(),
    })
    .select()
    .single()
  return data
}

async function getUserPurchases(userId) {
  const { data } = await supabase
    .from('purchases')
    .select('*')
    .eq('user_id', String(userId))
  return data || []
}

/* ── Leaderboard ── */
async function getLeaderboard(limit = 100) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .order('total_mined', { ascending: false })
    .limit(limit)

  return (data || []).map((u, i) => ({
    rank:       i + 1,
    id:         u.id,
    username:   u.username || u.first_name,
    totalMined: u.total_mined,
    blocks:     u.blocks,
    autoMining: u.auto_mine_until
      ? (u.auto_mine_until === -1 || u.auto_mine_until > Date.now())
      : false,
  }))
}

/* ── No-op save/load (Supabase handles persistence) ── */
function save() {}
function load() {}

module.exports = {
  getUser,
  getOrCreateUser,
  updateUser,
  getAllUsers,
  createSession,
  endSession,
  recordPurchase,
  getUserPurchases,
  getLeaderboard,
  save,
}