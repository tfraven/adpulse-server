const { Pool } = require('pg');
require('dotenv').config();

let pool = null;
let isPostgresConnected = false;

// In-memory fallback database in case PostgreSQL network is unreachable
let inMemoryStore = {
  users: [],
  wallets: {},
  plans: [],
  userPlans: {},
  ads: [],
  transactions: [],
  withdrawals: [],
  deposits: []
};

// Initialize PostgreSQL Pool
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  pool.on('error', (err) => {
    console.error('[PostgreSQL Error]:', err.message);
  });
}

// SQL DDL to initialize PostgreSQL Tables
const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS adpulse_users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(200) UNIQUE NOT NULL,
    mobile VARCHAR(50) NOT NULL,
    country VARCHAR(100) NOT NULL,
    referral_code VARCHAR(20) UNIQUE NOT NULL,
    referred_by VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS adpulse_wallets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES adpulse_users(id) ON DELETE CASCADE,
    deposit_balance NUMERIC(14, 2) DEFAULT 0.00,
    earning_balance NUMERIC(14, 2) DEFAULT 0.00,
    referral_balance NUMERIC(14, 2) DEFAULT 0.00,
    rewards_balance NUMERIC(14, 2) DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS adpulse_plans (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    price NUMERIC(14, 2) NOT NULL,
    total_ads INTEGER NOT NULL,
    daily_limit INTEGER NOT NULL,
    earning_per_ad NUMERIC(10, 2) NOT NULL,
    validity_days INTEGER NOT NULL DEFAULT 120,
    badge VARCHAR(50),
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS adpulse_user_plans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES adpulse_users(id) ON DELETE CASCADE,
    plan_id INTEGER REFERENCES adpulse_plans(id),
    plan_name VARCHAR(100) NOT NULL,
    daily_limit INTEGER NOT NULL,
    earning_per_ad NUMERIC(10, 2) NOT NULL,
    total_ads_quota INTEGER NOT NULL,
    ads_watched_today INTEGER DEFAULT 0,
    total_ads_watched INTEGER DEFAULT 0,
    last_watch_date VARCHAR(20) DEFAULT '',
    purchased_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) DEFAULT 'Active'
  );

  CREATE TABLE IF NOT EXISTS adpulse_ads (
    id SERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    sponsor VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 12,
    banner_url TEXT NOT NULL,
    target_url TEXT NOT NULL,
    tagline VARCHAR(255)
  );

  CREATE TABLE IF NOT EXISTS adpulse_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES adpulse_users(id) ON DELETE CASCADE,
    tx_id VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL, -- Deposit, Earning, Withdrawal, Referral, Rewards, PlanPurchase
    target_wallet VARCHAR(50) NOT NULL, -- Deposit, Earning, Referral, Rewards
    amount NUMERIC(14, 2) NOT NULL,
    description TEXT NOT NULL,
    gateway VARCHAR(50),
    status VARCHAR(20) DEFAULT 'Completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS adpulse_withdrawals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES adpulse_users(id) ON DELETE CASCADE,
    tx_id VARCHAR(50) UNIQUE NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    method VARCHAR(50) NOT NULL, -- EasyPaisa, JazzCash, Bank Transfer
    account_title VARCHAR(150) NOT NULL,
    account_number VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'Completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS adpulse_deposits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES adpulse_users(id) ON DELETE CASCADE,
    tx_id VARCHAR(50) UNIQUE NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    gateway VARCHAR(50) NOT NULL,
    sender_number VARCHAR(50) NOT NULL,
    trx_reference VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'Completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

const INITIAL_PLANS = [
  { slug: 'starter', name: 'Starter', price: 1000.00, total_ads: 1200, daily_limit: 10, earning_per_ad: 15.00, validity_days: 120, badge: 'Popular Starter', description: 'Ideal entry point for beginner online earners' },
  { slug: 'explorer', name: 'Explorer', price: 2500.00, total_ads: 3000, daily_limit: 25, earning_per_ad: 18.00, validity_days: 120, badge: 'Growth Choice', description: 'Accelerate your daily earnings with 25 ads quota' },
  { slug: 'pioneer', name: 'Pioneer', price: 5000.00, total_ads: 6000, daily_limit: 50, earning_per_ad: 22.00, validity_days: 120, badge: 'Most Selected ★', description: 'Our highest ROI tier for serious daily watchers' },
  { slug: 'climber', name: 'Climber', price: 10000.00, total_ads: 12000, daily_limit: 90, earning_per_ad: 26.00, validity_days: 120, badge: 'High Quota', description: 'For full-time earners looking to maximize returns' },
  { slug: 'achiever', name: 'Achiever', price: 20000.00, total_ads: 24000, daily_limit: 160, earning_per_ad: 32.00, validity_days: 120, badge: 'Executive Tier', description: 'Elite volume tier with premium earning rates' },
  { slug: 'silver-click', name: 'Silver Click', price: 50000.00, total_ads: 60000, daily_limit: 350, earning_per_ad: 45.00, validity_days: 120, badge: 'VIP Diamond', description: 'Maximum earning capacity and VIP priority support' }
];

const INITIAL_ADS = [
  { title: 'Binance Web3 Crypto Hub', sponsor: 'Binance Global', category: 'crypto', duration_seconds: 10, banner_url: 'https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?auto=format&fit=crop&w=800&q=80', target_url: 'https://binance.com', tagline: 'Trade over 350+ cryptos with zero fees on initial deposits.' },
  { title: 'EasyPaisa Super Save Digital', sponsor: 'Telenor Bank', category: 'fintech', duration_seconds: 12, banner_url: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80', target_url: 'https://easypaisa.com.pk', tagline: 'Instant transfers, mobile load cashbacks and high-yield savings.' },
  { title: 'JazzCash NextGen Merchant Payouts', sponsor: 'Mobilink Microfinance', category: 'fintech', duration_seconds: 10, banner_url: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80', target_url: 'https://jazzcash.com.pk', tagline: 'The fastest QR & merchant payments across Pakistan.' },
  { title: 'SadaPay Business Mastercard', sponsor: 'SadaPay Inc.', category: 'fintech', duration_seconds: 15, banner_url: 'https://images.unsplash.com/photo-1556742049-0a67e557224d?auto=format&fit=crop&w=800&q=80', target_url: 'https://sadapay.pk', tagline: 'Zero international exchange fees on global transactions.' },
  { title: 'Shopify Global Storefront AI', sponsor: 'Shopify Ltd', category: 'ecommerce', duration_seconds: 12, banner_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80', target_url: 'https://shopify.com', tagline: 'Launch your high-converting online dropshipping store today.' },
  { title: 'AWS Cloud & AI Server Hosting', sponsor: 'Amazon Web Services', category: 'tech', duration_seconds: 10, banner_url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80', target_url: 'https://aws.amazon.com', tagline: 'Deploy high speed microservices with $300 cloud credits.' },
  { title: 'TradingView Pro Chart Suite', sponsor: 'TradingView', category: 'crypto', duration_seconds: 15, banner_url: 'https://images.unsplash.com/photo-1642543492481-44e81e3914a7?auto=format&fit=crop&w=800&q=80', target_url: 'https://tradingview.com', tagline: 'Pinpoint institutional market structures and crypto breakouts.' },
  { title: 'Daraz Mega Flash Sale Bonanza', sponsor: 'Daraz Alibaba Group', category: 'ecommerce', duration_seconds: 10, banner_url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=800&q=80', target_url: 'https://daraz.pk', tagline: 'Up to 70% discounts on top electronics and fashion brands.' }
];

async function initDatabase() {
  if (!pool) {
    console.log('[Database] No PostgreSQL connection string provided, using memory store.');
    seedInMemory();
    return;
  }

  try {
    const client = await pool.connect();
    console.log('✅ [PostgreSQL Connected]: Successfully connected to PostgreSQL instance.');
    isPostgresConnected = true;

    // Run Table creations
    await client.query(CREATE_TABLES_SQL);
    console.log('✅ [PostgreSQL Schema]: All tables verified and ready.');

    // Seed Plans if not present
    const plansRes = await client.query('SELECT COUNT(*) FROM adpulse_plans');
    if (parseInt(plansRes.rows[0].count) === 0) {
      for (const p of INITIAL_PLANS) {
        await client.query(
          `INSERT INTO adpulse_plans (slug, name, price, total_ads, daily_limit, earning_per_ad, validity_days, badge, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [p.slug, p.name, p.price, p.total_ads, p.daily_limit, p.earning_per_ad, p.validity_days, p.badge, p.description]
        );
      }
      console.log('✅ [PostgreSQL Seed]: Initial subscription plans seeded.');
    }

    // Seed Ads if not present
    const adsRes = await client.query('SELECT COUNT(*) FROM adpulse_ads');
    if (parseInt(adsRes.rows[0].count) === 0) {
      for (const ad of INITIAL_ADS) {
        await client.query(
          `INSERT INTO adpulse_ads (title, sponsor, category, duration_seconds, banner_url, target_url, tagline)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [ad.title, ad.sponsor, ad.category, ad.duration_seconds, ad.banner_url, ad.target_url, ad.tagline]
        );
      }
      console.log('✅ [PostgreSQL Seed]: Sponsored ads catalog seeded.');
    }

    // Seed Demo User if not present
    const usersRes = await client.query('SELECT COUNT(*) FROM adpulse_users');
    if (parseInt(usersRes.rows[0].count) === 0) {
      const userRes = await client.query(
        `INSERT INTO adpulse_users (full_name, email, mobile, country, referral_code, referred_by, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        ['Sajid Khan', 'sajid.khan@example.com', '+92 300 1234567', 'Pakistan', 'EARN9482', 'TOPLEADER', 'password_hash_placeholder']
      );
      const userId = userRes.rows[0].id;

      // Seed 4 Wallets for demo user
      await client.query(
        `INSERT INTO adpulse_wallets (user_id, deposit_balance, earning_balance, referral_balance, rewards_balance)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, 4200.00, 7040.00, 2860.00, 750.00]
      );

      // Seed Pioneer active plan
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 88);

      const planPioneer = await client.query(`SELECT id FROM adpulse_plans WHERE slug = 'pioneer' LIMIT 1`);
      const pioneerId = planPioneer.rows[0]?.id || 3;

      const todayStr = new Date().toISOString().slice(0, 10);
      await client.query(
        `INSERT INTO adpulse_user_plans (user_id, plan_id, plan_name, daily_limit, earning_per_ad, total_ads_quota, ads_watched_today, total_ads_watched, last_watch_date, expires_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [userId, pioneerId, 'Pioneer Tier', 50, 22.00, 6000, 32, 1293, todayStr, expiresAt, 'Active']
      );

      // Seed Initial Transactions
      const sampleTxs = [
        [userId, 'TX-8492019', 'Earning', 'Earning', 'Watched 32 sponsored ads reward', 704.00, 'Ad Engagement Engine', 'Completed'],
        [userId, 'TX-7294012', 'Referral', 'Referral', '10% Commission from Bilal Ahmed plan activation', 500.00, 'Referral System', 'Completed'],
        [userId, 'TX-6192840', 'Deposit', 'Deposit', 'JazzCash deposit verification', 5000.00, 'JazzCash', 'Completed'],
        [userId, 'TX-5091823', 'PlanPurchase', 'Deposit', 'Purchased Pioneer Tier subscription plan', -5000.00, 'Internal Deposit Wallet', 'Completed'],
        [userId, 'TX-4091844', 'Rewards', 'Rewards', '7-Day Daily Login Streak Bonus', 150.00, 'Streak Engine', 'Completed'],
        [userId, 'TX-3091845', 'Withdrawal', 'Earning', 'Withdrawal to EasyPaisa (03001234567)', -2500.00, 'EasyPaisa', 'Completed']
      ];

      for (const tx of sampleTxs) {
        await client.query(
          `INSERT INTO adpulse_transactions (user_id, tx_id, type, target_wallet, description, amount, gateway, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          tx
        );
      }

      console.log('✅ [PostgreSQL Seed]: Default user Sajid Khan & sample wallets/transactions initialized.');
    }

    client.release();
  } catch (error) {
    console.error('⚠️ [PostgreSQL Fallback]: Could not connect to remote PostgreSQL DB, activating seamless memory store:', error.message);
    isPostgresConnected = false;
    seedInMemory();
  }
}

function seedInMemory() {
  inMemoryStore.plans = [...INITIAL_PLANS];
  inMemoryStore.ads = [...INITIAL_ADS];

  const demoUser = {
    id: 1,
    full_name: 'Sajid Khan',
    email: 'sajid.khan@example.com',
    mobile: '+92 300 1234567',
    country: 'Pakistan',
    referral_code: 'EARN9482',
    referred_by: 'TOPLEADER',
    created_at: new Date('2026-06-12T11:30:00Z')
  };
  inMemoryStore.users.push(demoUser);

  inMemoryStore.wallets[1] = {
    user_id: 1,
    deposit_balance: 4200.00,
    earning_balance: 7040.00,
    referral_balance: 2860.00,
    rewards_balance: 750.00
  };

  const expDate = new Date();
  expDate.setDate(expDate.getDate() + 88);
  inMemoryStore.userPlans[1] = {
    user_id: 1,
    plan_name: 'Pioneer Tier',
    daily_limit: 50,
    earning_per_ad: 22.00,
    total_ads_quota: 6000,
    ads_watched_today: 32,
    total_ads_watched: 1293,
    last_watch_date: new Date().toISOString().slice(0, 10),
    expires_at: expDate,
    status: 'Active'
  };

  inMemoryStore.transactions = [
    { id: 1, user_id: 1, tx_id: 'TX-8492019', type: 'Earning', target_wallet: 'Earning', amount: 704.00, description: 'Watched 32 sponsored ads reward', gateway: 'Ad Engagement Engine', status: 'Completed', created_at: new Date(Date.now() - 3600000) },
    { id: 2, user_id: 1, tx_id: 'TX-7294012', type: 'Referral', target_wallet: 'Referral', amount: 500.00, description: '10% Commission from Bilal Ahmed plan activation', gateway: 'Referral System', status: 'Completed', created_at: new Date(Date.now() - 14400000) },
    { id: 3, user_id: 1, tx_id: 'TX-6192840', type: 'Deposit', target_wallet: 'Deposit', amount: 5000.00, description: 'JazzCash deposit verification', gateway: 'JazzCash', status: 'Completed', created_at: new Date(Date.now() - 86400000) },
    { id: 4, user_id: 1, tx_id: 'TX-5091823', type: 'PlanPurchase', target_wallet: 'Deposit', amount: -5000.00, description: 'Purchased Pioneer Tier subscription plan', gateway: 'Internal Deposit Wallet', status: 'Completed', created_at: new Date(Date.now() - 86300000) },
    { id: 5, user_id: 1, tx_id: 'TX-4091844', type: 'Rewards', target_wallet: 'Rewards', amount: 150.00, description: '7-Day Daily Login Streak Bonus', gateway: 'Streak Engine', status: 'Completed', created_at: new Date(Date.now() - 172800000) },
    { id: 6, user_id: 1, tx_id: 'TX-3091845', type: 'Withdrawal', target_wallet: 'Earning', amount: -2500.00, description: 'Withdrawal to EasyPaisa (03001234567)', gateway: 'EasyPaisa', status: 'Completed', created_at: new Date(Date.now() - 259200000) }
  ];
}

async function query(text, params = []) {
  if (isPostgresConnected && pool) {
    return pool.query(text, params);
  }
  throw new Error('PostgreSQL not connected');
}

module.exports = {
  pool,
  query,
  initDatabase,
  getIsPostgresConnected: () => isPostgresConnected,
  inMemoryStore
};
