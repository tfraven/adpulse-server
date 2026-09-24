const prisma = require('../config/prisma');

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

// Get current active plan for user
exports.getUserActivePlan = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId) || 1;
    const todayStr = new Date().toISOString().slice(0, 10);

    const activePlan = await prisma.userPlan.findFirst({
      where: { userId, status: 'Active' },
      orderBy: { id: 'desc' }
    });

    if (!activePlan) {
      return res.json({ success: true, activePlan: null });
    }

    // Auto-reset daily quota at midnight
    if (activePlan.lastWatchDate !== todayStr) {
      const updatedPlan = await prisma.userPlan.update({
        where: { id: activePlan.id },
        data: {
          adsWatchedToday: 0,
          lastWatchDate: todayStr
        }
      });

      return res.json({
        success: true,
        activePlan: {
          id: updatedPlan.id,
          user_id: updatedPlan.userId,
          plan_name: updatedPlan.planName,
          daily_limit: updatedPlan.dailyLimit,
          earning_per_ad: updatedPlan.earningPerAd,
          total_ads_quota: updatedPlan.totalAdsQuota,
          ads_watched_today: updatedPlan.adsWatchedToday,
          total_ads_watched: updatedPlan.totalAdsWatched,
          last_watch_date: updatedPlan.lastWatchDate,
          expires_at: updatedPlan.expiresAt,
          status: updatedPlan.status
        }
      });
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

// Purchase plan - STRICT REQUIREMENT: Deducted from Deposit Wallet balance!
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
      return res.status(404).json({ success: false, message: 'Plan not found.' });
    }

    // Check user's Deposit Wallet balance
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });
    const currentDeposit = wallet ? wallet.depositBalance : 0;

    if (currentDeposit < plan.price) {
      return res.status(400).json({
        success: false,
        message: `Insufficient Deposit Wallet balance. This plan costs ₨ ${plan.price.toFixed(2)}, but your Deposit Wallet has ₨ ${currentDeposit.toFixed(2)}. Please make a deposit first via JazzCash, EasyPaisa, or Bank Transfer.`
      });
    }

    // Deduct from Deposit Wallet
    await prisma.wallet.update({
      where: { userId },
      data: { depositBalance: { decrement: plan.price } }
    });

    // Deactivate existing active plans
    await prisma.userPlan.updateMany({
      where: { userId, status: 'Active' },
      data: { status: 'Expired' }
    });

    // 120 Days Validity Period
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + plan.validityDays);
    const todayStr = new Date().toISOString().slice(0, 10);

    // Create New Active Plan
    const newPlan = await prisma.userPlan.create({
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

    // Record Transaction in Ledger
    await prisma.transaction.create({
      data: {
        userId,
        txId,
        type: 'PlanPurchase',
        targetWallet: 'Deposit',
        amount: -plan.price,
        description: `Purchased ${plan.name} Tier subscription plan (${plan.validityDays} days validity)`,
        gateway: 'Internal Deposit Wallet',
        status: 'Completed'
      }
    });

    // Award 10% referral commission if referred
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (user?.referredBy) {
      const refOwner = await prisma.user.findUnique({
        where: { referralCode: user.referredBy }
      });

      if (refOwner) {
        const commission = plan.price * 0.10;
        await prisma.wallet.update({
          where: { userId: refOwner.id },
          data: { referralBalance: { increment: commission } }
        });

        await prisma.transaction.create({
          data: {
            userId: refOwner.id,
            txId: 'REF-' + Math.floor(10000000 + Math.random() * 90000000),
            type: 'Referral',
            targetWallet: 'Referral',
            amount: commission,
            description: `10% Commission on ${plan.name} Plan from ${user.fullName}`,
            gateway: 'Referral Engine',
            status: 'Completed'
          }
        });
      }
    }

    return res.json({
      success: true,
      message: `Congratulations! ${plan.name} Tier plan activated successfully for 120 days.`,
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
    res.status(500).json({ success: false, message: error.message });
  }
};
