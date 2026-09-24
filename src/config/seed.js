const prisma = require('./prisma');

const INITIAL_PLANS = [
  { slug: 'starter', name: 'Starter', price: 1000.0, totalAds: 1200, dailyLimit: 10, earningPerAd: 15.0, validityDays: 120, badge: 'Popular Starter', description: 'Ideal entry point for beginner online earners' },
  { slug: 'explorer', name: 'Explorer', price: 2500.0, totalAds: 3000, dailyLimit: 25, earningPerAd: 18.0, validityDays: 120, badge: 'Growth Choice', description: 'Accelerate your daily earnings with 25 ads quota' },
  { slug: 'pioneer', name: 'Pioneer', price: 5000.0, totalAds: 6000, dailyLimit: 50, earningPerAd: 22.0, validityDays: 120, badge: 'Most Selected ★', description: 'Our highest ROI tier for serious daily watchers' },
  { slug: 'climber', name: 'Climber', price: 10000.0, totalAds: 12000, dailyLimit: 90, earningPerAd: 26.0, validityDays: 120, badge: 'High Quota', description: 'For full-time earners looking to maximize returns' },
  { slug: 'achiever', name: 'Achiever', price: 20000.0, totalAds: 24000, dailyLimit: 160, earningPerAd: 32.0, validityDays: 120, badge: 'Executive Tier', description: 'Elite volume tier with premium earning rates' },
  { slug: 'silver-click', name: 'Silver Click', price: 50000.0, totalAds: 60000, dailyLimit: 350, earningPerAd: 45.0, validityDays: 120, badge: 'VIP Diamond', description: 'Maximum earning capacity and VIP priority support' }
];

const INITIAL_ADS = [
  {
    title: 'Google Cloud AI & Web3 Compute Infrastructure',
    sponsor: 'Google Ads Partner',
    category: 'tech',
    durationSeconds: 10,
    bannerUrl: 'https://images.unsplash.com/photo-1573164713988-8665fc963095?auto=format&fit=crop&w=800&q=80',
    targetUrl: 'https://cloud.google.com',
    tagline: 'Deploy scalable microservices and machine learning models with $300 cloud credits.',
    isGoogleAd: true,
    googleAdClient: 'ca-pub-4715061326676029',
    googleAdSlot: '1948201948'
  },
  {
    title: 'Google Workspace for High-Growth Startups',
    sponsor: 'Google Ads Display Network',
    category: 'fintech',
    durationSeconds: 12,
    bannerUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80',
    targetUrl: 'https://workspace.google.com',
    tagline: 'Custom business emails, secure cloud drive storage, and team productivity tools.',
    isGoogleAd: true,
    googleAdClient: 'ca-pub-4715061326676029',
    googleAdSlot: '1948201949'
  },
  {
    title: 'Binance Web3 Crypto Hub & Futures',
    sponsor: 'Binance Global',
    category: 'crypto',
    durationSeconds: 10,
    bannerUrl: 'https://images.unsplash.com/photo-1622979135225-d2ba269bc1df?auto=format&fit=crop&w=800&q=80',
    targetUrl: 'https://binance.com',
    tagline: 'Trade over 350+ cryptos with zero fees on initial deposits.',
    isGoogleAd: false
  },
  {
    title: 'EasyPaisa Super Save Digital Accounts',
    sponsor: 'Telenor Bank',
    category: 'fintech',
    durationSeconds: 12,
    bannerUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80',
    targetUrl: 'https://easypaisa.com.pk',
    tagline: 'Instant transfers, mobile load cashbacks and high-yield savings.',
    isGoogleAd: false
  },
  {
    title: 'JazzCash NextGen Merchant Payouts',
    sponsor: 'Mobilink Microfinance',
    category: 'fintech',
    durationSeconds: 10,
    bannerUrl: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=800&q=80',
    targetUrl: 'https://jazzcash.com.pk',
    tagline: 'The fastest QR & merchant payments across Pakistan.',
    isGoogleAd: false
  },
  {
    title: 'SadaPay Business Mastercard',
    sponsor: 'SadaPay Inc.',
    category: 'fintech',
    durationSeconds: 15,
    bannerUrl: 'https://images.unsplash.com/photo-1556742049-0a67e557224d?auto=format&fit=crop&w=800&q=80',
    targetUrl: 'https://sadapay.pk',
    tagline: 'Zero international exchange fees on global transactions.',
    isGoogleAd: false
  },
  {
    title: 'Shopify Global Storefront AI Engine',
    sponsor: 'Shopify Ltd',
    category: 'ecommerce',
    durationSeconds: 12,
    bannerUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80',
    targetUrl: 'https://shopify.com',
    tagline: 'Launch your high-converting online dropshipping store today.',
    isGoogleAd: false
  },
  {
    title: 'TradingView Pro Institutional Suite',
    sponsor: 'TradingView',
    category: 'crypto',
    durationSeconds: 15,
    bannerUrl: 'https://images.unsplash.com/photo-1642543492481-44e81e3914a7?auto=format&fit=crop&w=800&q=80',
    targetUrl: 'https://tradingview.com',
    tagline: 'Pinpoint institutional market structures and crypto breakouts.',
    isGoogleAd: false
  }
];

async function seedDatabase() {
  try {
    // 1. Seed Plans
    const plansCount = await prisma.plan.count();
    if (plansCount === 0) {
      for (const p of INITIAL_PLANS) {
        await prisma.plan.create({ data: p });
      }
      console.log('✅ [Prisma Seed]: Initial 6 subscription plans seeded into .db file.');
    }

    // 2. Seed Ads (including Google Ads)
    const adsCount = await prisma.ad.count();
    if (adsCount === 0) {
      for (const ad of INITIAL_ADS) {
        await prisma.ad.create({ data: ad });
      }
      console.log('✅ [Prisma Seed]: Sponsored ads & Google Ads catalog seeded into .db file.');
    }

    // 3. Seed Demo User
    const usersCount = await prisma.user.count();
    if (usersCount === 0) {
      const demoUser = await prisma.user.create({
        data: {
          fullName: 'Sajid Khan',
          email: 'sajid.khan@example.com',
          mobile: '+92 300 1234567',
          country: 'Pakistan',
          referralCode: 'EARN9482',
          referredBy: 'TOPLEADER',
          passwordHash: 'hashed_pwd'
        }
      });

      // Seed 4 Wallets for demo user
      await prisma.wallet.create({
        data: {
          userId: demoUser.id,
          depositBalance: 4200.0,
          earningBalance: 7040.0,
          referralBalance: 2860.0,
          rewardsBalance: 750.0
        }
      });

      // Seed Pioneer active plan
      const pioneerPlan = await prisma.plan.findUnique({ where: { slug: 'pioneer' } });
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 88);
      const todayStr = new Date().toISOString().slice(0, 10);

      await prisma.userPlan.create({
        data: {
          userId: demoUser.id,
          planId: pioneerPlan ? pioneerPlan.id : 3,
          planName: 'Pioneer Tier',
          dailyLimit: 50,
          earningPerAd: 22.0,
          totalAdsQuota: 6000,
          adsWatchedToday: 32,
          totalAdsWatched: 1293,
          lastWatchDate: todayStr,
          expiresAt,
          status: 'Active'
        }
      });

      // Seed Sample Transactions in unified ledger
      const sampleTxs = [
        { userId: demoUser.id, txId: 'TX-8492019', type: 'Earning', targetWallet: 'Earning', amount: 704.0, description: 'Watched 32 sponsored ads reward', gateway: 'Ad Engagement Engine', status: 'Completed' },
        { userId: demoUser.id, txId: 'TX-7294012', type: 'Referral', targetWallet: 'Referral', amount: 500.0, description: '10% Commission from Bilal Ahmed plan activation', gateway: 'Referral System', status: 'Completed' },
        { userId: demoUser.id, txId: 'TX-6192840', type: 'Deposit', targetWallet: 'Deposit', amount: 5000.0, description: 'JazzCash deposit verification', gateway: 'JazzCash', status: 'Completed' },
        { userId: demoUser.id, txId: 'TX-5091823', type: 'PlanPurchase', targetWallet: 'Deposit', amount: -5000.0, description: 'Purchased Pioneer Tier subscription plan', gateway: 'Internal Deposit Wallet', status: 'Completed' },
        { userId: demoUser.id, txId: 'TX-4091844', type: 'Rewards', targetWallet: 'Rewards', amount: 150.0, description: '7-Day Daily Login Streak Bonus', gateway: 'Streak Engine', status: 'Completed' },
        { userId: demoUser.id, txId: 'TX-3091845', type: 'Withdrawal', targetWallet: 'Earning', amount: -2500.0, description: 'Withdrawal to EasyPaisa (03001234567)', gateway: 'EasyPaisa', status: 'Completed' }
      ];

      for (const tx of sampleTxs) {
        await prisma.transaction.create({ data: tx });
      }

      // Seed direct team members referred by Sajid
      const directMembers = [
        { fullName: 'Bilal Ahmed', email: 'bilal.ahmed@gmail.com', mobile: '+92 301 9988776', country: 'Pakistan', referralCode: 'EARN8821', referredBy: 'EARN9482' },
        { fullName: 'Zainab Fatima', email: 'zainab.f@yahoo.com', mobile: '+92 321 4455667', country: 'Pakistan', referralCode: 'EARN7732', referredBy: 'EARN9482' },
        { fullName: 'Hamza Tariq', email: 'hamza.tariq@outlook.com', mobile: '+92 333 1122334', country: 'Pakistan', referralCode: 'EARN6643', referredBy: 'EARN9482' },
        { fullName: 'Ayesha Malik', email: 'ayesha.m@gmail.com', mobile: '+92 345 5566778', country: 'Pakistan', referralCode: 'EARN5554', referredBy: 'EARN9482' }
      ];

      for (const m of directMembers) {
        const createdMember = await prisma.user.create({ data: m });
        await prisma.wallet.create({
          data: {
            userId: createdMember.id,
            depositBalance: 500.0,
            earningBalance: 1200.0,
            referralBalance: 150.0,
            rewardsBalance: 100.0
          }
        });
      }

      console.log('✅ [Prisma Seed]: Demo user Sajid Khan, wallets, active plan & referrals created in .db file.');
    }
  } catch (err) {
    console.error('Error during seeding:', err);
  }
}

module.exports = { seedDatabase };
