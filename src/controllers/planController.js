const prisma = require('../config/prisma');
const { resolveActivePlan, getTodayString } = require('../utils/planHelper');

// Browse all available tiered plans
exports.getPlans = async (req, res) => {
  try {
    const plans = await prisma.plan.findMany({
      orderBy: { price: 'asc' }
    });

    return res.json({
      success: true,
      plans: plans.map(p => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        price: p.price,
        total_ads: p.totalAds,
        daily_limit: p.dailyLimit,
        earning_per_ad: p.earningPerAd,
        validity_days: p.validityDays,
        badge: p.badge,
        description: p.description
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get current active plan for user (checks validity expiration, lifetime quota, and daily reset)
exports.getUserActivePlan = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId) || 1;

    // Atomically resolves validity, total quota exhaustion, and date rollover
    const activePlan = await resolveActivePlan(prisma, userId);

    if (!activePlan) {
      return res.json({ success: true, activePlan: null });
    }

    return res.json({
      success: true,
      activePlan: {
        id: activePlan.id,
        user_id: activePlan.userId,
        plan_name: activePlan.planName,
        daily_limit: activePlan.dailyLimit,
        earning_per_ad: activePlan.earningPerAd,
        total_ads_quota: activePlan.totalAdsQuota,
        ads_watched_today: activePlan.adsWatchedToday,
        total_ads_watched: activePlan.totalAdsWatched,
        last_watch_date: activePlan.lastWatchDate,
        expires_at: activePlan.expiresAt,
        status: activePlan.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Purchase plan - STRICT REQUIREMENT: Deducted atomically from Deposit Wallet balance!
exports.purchasePlan = async (req, res) => {
  try {
    const userId = parseInt(req.body.userId) || 1;
    const { planSlug } = req.body;

    if (!planSlug) {
      return res.status(400).json({ success: false, message: 'Plan slug is required.' });
    }

    const plan = await prisma.plan.findUnique({
      where: { slug: planSlug }
    });
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Requested plan not found.' });
    }

    // Execute atomic plan purchase transaction
    const newPlan = await prisma.$transaction(async (tx) => {
      // 1. Check user's Deposit Wallet balance inside transaction
      let wallet = await tx.wallet.findUnique({
        where: { userId }
      });

      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            userId,
            depositBalance: 0,
            earningBalance: 0,
            referralBalance: 0,
            rewardsBalance: 0
          }
        });
      }

      if (wallet.depositBalance < plan.price) {
        throw new Error(
          `Insufficient Deposit Wallet balance. This plan costs ₨ ${plan.price.toLocaleString()}, but your Deposit Wallet currently has ₨ ${wallet.depositBalance.toLocaleString()}. Please make a deposit first.`
        );
      }

      // 2. Deduct from Deposit Wallet
      await tx.wallet.update({
        where: { userId },
        data: { depositBalance: { decrement: plan.price } }
      });

      // 3. Deactivate any existing active plans
      await tx.userPlan.updateMany({
        where: { userId, status: 'Active' },
        data: { status: 'Expired' }
      });

      // 4. Calculate validity period (e.g. 120 Days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + plan.validityDays);
      const todayStr = getTodayString();

      // 5. Create New Active Plan
      const createdPlan = await tx.userPlan.create({
        data: {
          userId,
          planId: plan.id,
          planName: `${plan.name} Tier`,
          dailyLimit: plan.dailyLimit,
          earningPerAd: plan.earningPerAd,
          totalAdsQuota: plan.totalAds,
          adsWatchedToday: 0,
          totalAdsWatched: 0,
          lastWatchDate: todayStr,
          expiresAt,
          status: 'Active'
        }
      });

      const txId = 'PLN-' + Math.floor(10000000 + Math.random() * 90000000);

      // 6. Record Transaction in Unified Ledger
      await tx.transaction.create({
        data: {
          userId,
          txId,
          type: 'PlanPurchase',
          targetWallet: 'Deposit',
          amount: -plan.price,
          description: `Purchased ${plan.name} Tier subscription plan (${plan.validityDays} days validity, ${plan.totalAds.toLocaleString()} ads quota)`,
          gateway: 'Internal Deposit Wallet',
          status: 'Completed'
        }
      });

      // 7. Award 10% referral commission to referrer if user was referred
      const purchaser = await tx.user.findUnique({
        where: { id: userId }
      });

      if (purchaser && purchaser.referredBy) {
        const refOwner = await tx.user.findUnique({
          where: { referralCode: purchaser.referredBy }
        });

        if (refOwner && refOwner.id !== userId) {
          const commission = plan.price * 0.10;
          await tx.wallet.update({
            where: { userId: refOwner.id },
            data: { referralBalance: { increment: commission } }
          });

          await tx.transaction.create({
            data: {
              userId: refOwner.id,
              txId: 'REF-' + Math.floor(10000000 + Math.random() * 90000000),
              type: 'Referral',
              targetWallet: 'Referral',
              amount: commission,
              description: `10% Commission on ${plan.name} Plan purchase from ${purchaser.fullName}`,
              gateway: 'Referral Engine',
              status: 'Completed'
            }
          });
        }
      }

      return createdPlan;
    });

    return res.json({
      success: true,
      message: `Congratulations! ${plan.name} Tier activated successfully with ${plan.validityDays} days validity and ${plan.dailyLimit} ads/day.`,
      activePlan: {
        id: newPlan.id,
        user_id: newPlan.userId,
        plan_name: newPlan.planName,
        daily_limit: newPlan.dailyLimit,
        earning_per_ad: newPlan.earningPerAd,
        total_ads_quota: newPlan.totalAdsQuota,
        ads_watched_today: newPlan.adsWatchedToday,
        total_ads_watched: newPlan.totalAdsWatched,
        last_watch_date: newPlan.lastWatchDate,
        expires_at: newPlan.expiresAt,
        status: newPlan.status
      }
    });

  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
