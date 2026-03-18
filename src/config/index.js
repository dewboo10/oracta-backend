require('dotenv').config()

module.exports = {
  PORT:     process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_DEV:   (process.env.NODE_ENV || 'development') === 'development',

  BOT_TOKEN:    process.env.BOT_TOKEN || 'dev_token',
  BOT_USERNAME: process.env.BOT_USERNAME || 'oracta_bot',

  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',').map(s => s.trim()),

  RATE_LIMIT: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    max:      parseInt(process.env.RATE_LIMIT_MAX       || '100'),
  },

  PERSIST_INTERVAL_MS: parseInt(process.env.PERSIST_INTERVAL_MS || '30000'),

  // Game constants — mirrors frontend constants.js
  UPGRADES: [
    { id: 1, name: 'Neural Boost',  baseCost: 500,    rateBonus: 0.5, maxLevel: 5 },
    { id: 2, name: 'Plasma Array',  baseCost: 2500,   rateBonus: 2.5, maxLevel: 5 },
    { id: 3, name: 'Quantum Forge', baseCost: 10000,  rateBonus: 8,   maxLevel: 4 },
    { id: 4, name: 'Dark Matter',   baseCost: 40000,  rateBonus: 25,  maxLevel: 3 },
    { id: 5, name: 'Singularity',   baseCost: 180000, rateBonus: 80,  maxLevel: 2 },
  ],

  STORE_ITEMS: [
    { id: 'auto_24h',  stars: 75,   autoMineHours: 24,       category: 'automine' },
    { id: 'auto_7d',   stars: 299,  autoMineHours: 168,      category: 'automine' },
    { id: 'auto_30d',  stars: 899,  autoMineHours: 720,      category: 'automine' },
    { id: 'auto_life', stars: 2499, autoMineHours: Infinity,  category: 'automine' },
    { id: 'boost_3x',  stars: 49,   boostMult: 3,  boostSecs: 3600,  category: 'boosts' },
    { id: 'boost_10x', stars: 149,  boostMult: 10, boostSecs: 7200,  category: 'boosts' },
    { id: 'chest_s',   stars: 99,   octReward: 10000,  category: 'coins' },
    { id: 'chest_m',   stars: 249,  octReward: 50000,  category: 'coins' },
    { id: 'chest_xl',  stars: 599,  octReward: 200000, category: 'coins' },
  ],

  MILESTONES: [1000, 5000, 20000, 100000, 500000, 2000000, 10000000],
}
