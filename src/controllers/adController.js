const prisma = require('../config/prisma');

// Get available ads catalog (including Google Ads units)
exports.getAds = async (req, res) => {
  try {
    const ads = await prisma.ad.findMany({
      orderBy: { id: 'asc' }
    });

    return res.json({
      success: true,
      ads: ads.map(a => ({
        id: a.id,
        title: a.title,
        sponsor: a.sponsor,
        category: a.category,
        duration_seconds: a.durationSeconds,
        banner_url: a.bannerUrl,
        target_url: a.targetUrl,
        tagline: a.tagline,
        is_google_ad: a.isGoogleAd,
        google_ad_client: a.googleAdClient,
        google_ad_slot: a.googleAdSlot
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Complete Ad View & Disburse Reward to Earning Wallet
exports.completeAdView = async (req, res) => {
  try {
    const userId = parseInt(req.body.userId) || 1;
    const { adId, watchedSeconds, mathAnswer, expectedAnswer } = req.body;
    const todayStr = new Date().toISOString().slice(0, 10);

    // 1. Verify Anti-Bot Security Check
    if (mathAnswer === undefined || parseInt(mathAnswer) !== parseInt(expectedAnswer)) {
      return res.status(400).json({ success: false, message: 'Invalid anti-bot verification answer. Please solve the calculation correctly.' });
    }

    // 2. Fetch User Active Plan - STRICT RULE: Cannot earn without active plan!
    const activePlan = await prisma.userPlan.findFirst({
      where: { userId, status: 'Active' },
      orderBy: { id: 'desc' }
    });

    if (!activePlan) {
      return res.status(403).json({
        success: false,
        message: 'Active subscription plan required to earn money from watching ads. Please choose a plan first.'
      });
    }

    // Check daily limit and auto-reset if new day
    let adsWatchedToday = activePlan.adsWatchedToday;
    if (activePlan.lastWatchDate !== todayStr) {
      adsWatchedToday = 0;
    }

    if (adsWatchedToday >= activePlan.dailyLimit) {
      return res.status(400).json({
        success: false,
        message: `Daily limit reached! You have watched ${adsWatchedToday}/${activePlan.dailyLimit} ads today. Your quota resets at 00:00 midnight or upgrade your plan to increase limits.`
      });
    }

    // Fetch ad details
    const ad = await prisma.ad.findUnique({
      where: { id: parseInt(adId) }
    });
    if (!ad) {
      return res.status(404).json({ success: false, message: 'Ad not found.' });
    }

    // Verify watch time
    if (watchedSeconds < ad.durationSeconds - 1) {
      return res.status(400).json({
        success: false,
        message: `Watch time requirement not met. You must watch the entire ${ad.durationSeconds} seconds of the ad to earn reward.`
      });
    }

    const earningRate = activePlan.earningPerAd;
    const newWatchedToday = adsWatchedToday + 1;
    const newTotalWatched = activePlan.totalAdsWatched + 1;

    // Update user plan counters
    await prisma.userPlan.update({
      where: { id: activePlan.id },
      data: {
        adsWatchedToday: newWatchedToday,
        totalAdsWatched: newTotalWatched,
        lastWatchDate: todayStr
      }
    });

    // Disburse reward to EARNING WALLET
    await prisma.wallet.update({
      where: { userId },
      data: { earningBalance: { increment: earningRate } }
    });

    const txId = 'AD-' + Math.floor(10000000 + Math.random() * 90000000);

    // Record in unified transactions ledger
    await prisma.transaction.create({
      data: {
        userId,
        txId,
        type: 'Earning',
        targetWallet: 'Earning',
        amount: earningRate,
        description: `Earned from viewing ${ad.isGoogleAd ? 'Google Ad: ' : 'sponsored ad: '}"${ad.title}"`,
        gateway: ad.isGoogleAd ? 'Google AdSense Partner' : 'Ad Engagement Engine',
        status: 'Completed'
      }
    });

    return res.json({
      success: true,
      message: `+₨ ${earningRate.toFixed(2)} disbursed to your Earning Wallet!`,
      rewardAmount: earningRate,
      adsWatchedToday: newWatchedToday,
      dailyLimit: activePlan.dailyLimit,
      remainingToday: activePlan.dailyLimit - newWatchedToday,
      txId
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Simulate 24-hour daily limit reset
exports.simulateDailyReset = async (req, res) => {
  try {
    const userId = parseInt(req.body.userId) || 1;
    const todayStr = new Date().toISOString().slice(0, 10);

    await prisma.userPlan.updateMany({
      where: { userId, status: 'Active' },
      data: {
        adsWatchedToday: 0,
        lastWatchDate: todayStr
      }
    });

    return res.json({
      success: true,
      message: '24-hour daily ad quota has been reset to 0! You can watch ads again.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
