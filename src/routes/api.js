const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const walletController = require('../controllers/walletController');
const planController = require('../controllers/planController');
const adController = require('../controllers/adController');
const statsController = require('../controllers/statsController');

// 1. Auth & Profile Routes
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/profile', authController.getProfile);
router.put('/auth/profile', authController.updateProfile);

// 2. Multi-Wallet & Financial Ledger Routes
router.get('/wallets', walletController.getWallets);
router.post('/wallets/deposit', walletController.deposit);
router.post('/wallets/withdraw', walletController.withdraw);
router.post('/wallets/claim-streak', walletController.claimDailyStreak);
router.get('/wallets/transactions', walletController.getTransactions);

// 3. Subscription Plans Routes
router.get('/plans', planController.getPlans);
router.get('/plans/active', planController.getUserActivePlan);
router.post('/plans/purchase', planController.purchasePlan);

// 4. Ad Viewing & Earning Engine Routes
router.get('/ads', adController.getAds);
router.post('/ads/start', adController.startAdSession);
router.post('/ads/complete', adController.completeAdView);
router.post('/ads/reset-daily', adController.simulateDailyReset);

// 5. Analytics & Dashboard Stats
router.get('/stats/dashboard', statsController.getDashboardStats);

module.exports = router;
