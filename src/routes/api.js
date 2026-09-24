const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const authController = require('../controllers/authController');
const walletController = require('../controllers/walletController');
const planController = require('../controllers/planController');
const adController = require('../controllers/adController');
const statsController = require('../controllers/statsController');

// ─── 1. Public Auth Routes (No JWT Required) ─────────────────────────────────
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);

// ─── 2. Protected Auth & Profile Routes ──────────────────────────────────────
router.get('/auth/profile', requireAuth, authController.getProfile);
router.put('/auth/profile', requireAuth, authController.updateProfile);

// ─── 3. Multi-Wallet & Financial Ledger Routes ───────────────────────────────
router.get('/wallets', requireAuth, walletController.getWallets);
router.post('/wallets/deposit', requireAuth, walletController.deposit);
router.post('/wallets/withdraw', requireAuth, walletController.withdraw);
router.post('/wallets/claim-streak', requireAuth, walletController.claimDailyStreak);
router.get('/wallets/transactions', requireAuth, walletController.getTransactions);

// ─── 4. Subscription Plans Routes ────────────────────────────────────────────
router.get('/plans', planController.getPlans);                                   // Public - catalog listing
router.get('/plans/active', requireAuth, planController.getUserActivePlan);
router.post('/plans/purchase', requireAuth, planController.purchasePlan);

// ─── 5. Ad Viewing & Earning Engine Routes ───────────────────────────────────
router.get('/ads', requireAuth, adController.getAds);
router.post('/ads/start', requireAuth, adController.startAdSession);
router.post('/ads/complete', requireAuth, adController.completeAdView);
router.post('/ads/reset-daily', requireAuth, adController.simulateDailyReset);

// ─── 6. Analytics & Dashboard Stats ─────────────────────────────────────────
router.get('/stats/dashboard', requireAuth, statsController.getDashboardStats);

module.exports = router;
