# ORACTA Backend — Node.js API v2.0

Production-ready Express.js API for the ORACTA Telegram Mini App OCT mining game.
Disk-persistent. Zero external DB required out of the box.

---

## Quick Start

```bash
npm install
cp .env.example .env        # set BOT_TOKEN
npm run dev                 # nodemon, port 5000
# or
npm start                   # production
```

---

## All Endpoints

| Method | Path                           | Auth | Description                           |
|--------|--------------------------------|------|---------------------------------------|
| GET    | `/`                            | –    | API info                              |
| GET    | `/api/health`                  | –    | Health + uptime + user count          |
| GET    | `/api/health/ping`             | –    | Minimal ping                          |
| POST   | `/api/auth/telegram`           | –    | Validate initData, get/create user    |
| GET    | `/api/auth/me`                 | ✅   | Get own profile                       |
| GET    | `/api/user/profile`            | ✅   | Full user profile                     |
| POST   | `/api/user/sync`               | ✅   | Sync mining session to server         |
| POST   | `/api/user/upgrade`            | ✅   | Buy OCT upgrade (deducts balance)     |
| POST   | `/api/user/mission/claim`      | ✅   | Claim mission checkpoint reward       |
| POST   | `/api/user/referral/apply`     | ✅   | Apply referral code (first time only) |
| GET    | `/api/user/referrals`          | ✅   | List your referred users              |
| POST   | `/api/user/session/start`      | ✅   | Register session start                |
| POST   | `/api/user/session/end`        | ✅   | Close session + update playtime       |
| GET    | `/api/store/items`             | –    | All store items with Stars prices     |
| POST   | `/api/store/invoice`           | ✅   | Create Telegram Stars invoice link    |
| POST   | `/api/store/confirm`           | ✅   | Confirm Stars payment + apply effects |
| GET    | `/api/store/purchases`         | ✅   | Own purchase history                  |
| POST   | `/api/store/webhook`           | –    | Telegram Bot webhook (Stars payments) |
| GET    | `/api/leaderboard`             | –    | Top 100 miners                        |
| GET    | `/api/leaderboard/rank/:id`    | –    | Specific user's rank                  |
| GET    | `/api/refer/code`              | ✅   | Get/generate your referral code       |
| POST   | `/api/refer/apply`             | ✅   | Apply someone's referral code         |
| GET    | `/api/refer/friends`           | ✅   | List friends you've referred          |

---

## File Structure

```
oracta-backend/
├── src/
│   ├── index.js              ← Entry point — all middleware + routes wired
│   ├── config/
│   │   └── index.js          ← All env-var config + game constants
│   ├── middleware/
│   │   ├── auth.js           ← Telegram initData HMAC validation
│   │   ├── errorHandler.js   ← Global 404 + error handler
│   │   └── rateLimiter.js    ← Rate limits (api / auth / purchase)
│   ├── models/
│   │   └── db.js             ← In-memory store with disk persistence
│   ├── routes/
│   │   ├── auth.js           ← /api/auth/*
│   │   ├── user.js           ← /api/user/*
│   │   ├── store.js          ← /api/store/*
│   │   ├── leaderboard.js    ← /api/leaderboard/*
│   │   ├── refer.js          ← /api/refer/*
│   │   └── health.js         ← /api/health/*
│   └── services/
│       ├── game.js           ← All game logic (rate calc, upgrade, claim, referral)
│       └── telegram.js       ← initData validation + Stars invoice + webhook
├── data/                     ← Auto-created. users.json + purchases.json saved here
├── tests/
│   └── api.test.js           ← 25 smoke tests, zero dependencies
├── package.json
├── .env.example
└── README.md
```

---

## Authentication

All `✅` routes require:
```
Authorization: tma <initData>
```
where `initData` is the raw Telegram Mini App `window.Telegram.WebApp.initData` string.

**Dev mode** (`BOT_TOKEN=dev_token`): validation skipped, user `dev_user` injected automatically.

---

## Telegram Stars Payment Flow

```
1. Frontend calls  POST /api/store/invoice  { itemId }
2. Server calls Telegram Bot API createInvoiceLink → returns link
3. Frontend calls  window.Telegram.WebApp.openInvoice(link)
4. User pays in Telegram
5. Telegram sends  pre_checkout_query  →  POST /api/store/webhook
   Server answers answerPreCheckoutQuery OK within 10 seconds
6. Telegram sends  successful_payment  →  POST /api/store/webhook
   Server credits user (auto-mine, OCT, etc.)
7. Frontend polls  GET /api/user/profile  to refresh state

   -- OR simple flow (no invoice link) --
5. Frontend calls  POST /api/store/confirm  { itemId, telegramPaymentChargeId }
   Server verifies + applies effects immediately
```

---

## Data Persistence

Data is saved to `data/users.json` and `data/purchases.json`:
- Every 30 seconds (configurable via `PERSIST_INTERVAL_MS`)
- On `SIGINT` / `SIGTERM` (graceful shutdown)

To switch to a real database: replace the Map operations in `src/models/db.js` with your DB calls. The function signatures stay the same.

---

## Auto-Mine Server Tick

Every 60 seconds the server credits OCT to all users with active auto-mine:
```
rate = calcRate(user.upgrades) × 2   (2× for auto-mine)
earned = rate × 60                    (60 seconds worth)
user.balance += earned
user.totalMined += earned
```
This runs in `src/index.js` via `setInterval`.

---

## Running Tests

```bash
# Terminal 1
npm start

# Terminal 2
npm test       # node tests/api.test.js
```

25 smoke tests. Zero external dependencies. Covers every endpoint.

---

## Deploying

```bash
export BOT_TOKEN=your_real_bot_token
export NODE_ENV=production
export PORT=5000
export CORS_ORIGINS=https://yourapp.telegram.com

npm start
```

Set Telegram webhook after deploying:
```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://yourserver.com/api/store/webhook
```

Telegram requires HTTPS for webhooks. Use nginx + certbot or a service like Railway/Render.
