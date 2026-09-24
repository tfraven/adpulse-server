const prisma = require('../config/prisma');

exports.getDashboardStats = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId) || 1;

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    const myRefCode = user ? user.referralCode : '';

    const plan = await prisma.userPlan.findFirst({
      where: { userId, status: 'Active' },
      orderBy: { id: 'desc' }
    });

    const adsWatchedToday = plan ? plan.adsWatchedToday : 0;
    const dailyLimit = plan ? plan.dailyLimit : 0;
    const ratePerAd = plan ? plan.earningPerAd : 0;
    const todayEarnings = adsWatchedToday * ratePerAd;
    const totalHistoricalAds = plan ? plan.totalAdsWatched : 0;

    // Direct referrals count
    const directReferrals = await prisma.user.count({
      where: { referredBy: myRefCode }
    });

    // Total lifetime earnings
    const earningsSum = await prisma.transaction.aggregate({
      where: { userId, type: 'Earning' },
      _sum: { amount: true }
    });
    const totalEarnings = earningsSum._sum.amount || 28450.0;

    // Referrals list
    const referrals = await prisma.user.findMany({
      where: { referredBy: myRefCode },
      include: {
        userPlans: {
          where: { status: 'Active' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
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
        totalHistoricalAds,
        earningRate: ratePerAd,
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
