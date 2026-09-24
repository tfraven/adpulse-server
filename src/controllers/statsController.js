const prisma = require('../config/prisma');
const { resolveActivePlan, getTodayString } = require('../utils/planHelper');

exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.userId; // injected by requireAuth middleware

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    const myRefCode = user ? user.referralCode : '';

    // Atomically resolve active plan with expiration and day rollover
    const plan = await resolveActivePlan(prisma, userId);

    const adsWatchedToday = plan ? plan.adsWatchedToday : 0;
    const dailyLimit = plan ? plan.dailyLimit : 0;
    const ratePerAd = plan ? plan.earningPerAd : 0;
    const todayEarnings = adsWatchedToday * ratePerAd;

    // Direct referrals count
    const directReferrals = await prisma.user.count({
      where: { referredBy: myRefCode }
    });

    // Total lifetime earnings from Earning transactions (NO hardcoded fallback!)
    const earningsSum = await prisma.transaction.aggregate({
      where: { userId, type: 'Earning' },
      _sum: { amount: true }
    });
    const totalEarnings = earningsSum._sum.amount ?? 0.0;

    // Total historical ads watched count
    const totalAdsWatchedCount = await prisma.transaction.count({
      where: { userId, type: 'Earning' }
    });

    // Team Referrals list
    const referrals = await prisma.user.findMany({
      where: { referredBy: myRefCode },
      include: {
        userPlans: {
          where: { status: 'Active' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 15
    });

    return res.json({
      success: true,
      stats: {
        todayEarnings,
        adsWatchedToday,
        dailyLimit,
        remainingToday: Math.max(0, dailyLimit - adsWatchedToday),
        directReferrals,
        totalEarnings,
        totalHistoricalAds: totalAdsWatchedCount || (plan ? plan.totalAdsWatched : 0),
        earningRate: ratePerAd,
        hasActivePlan: !!plan,
        planName: plan ? plan.planName : null,
        referralsList: referrals.map(r => ({
          full_name: r.fullName,
          email: r.email,
          created_at: r.createdAt,
          plan_name: r.userPlans[0]?.planName || 'Free Member'
        }))
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
