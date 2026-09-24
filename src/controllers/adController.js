const prisma = require('../config/prisma');
const { resolveActivePlan, getTodayString } = require('../utils/planHelper');
const { createAdChallenge, verifyAdChallenge } = require('../utils/adSecurity');

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

// Start Ad Session & Generate Anti-Bot Security Challenge
exports.startAdSession = async (req, res) => {
  try {
    const userId = req.userId; // injected by requireAuth middleware
    const adId = parseInt(req.body.adId);

    if (!adId) {
      return res.status(400).json({ success: false, message: 'Ad ID is required.' });
    }

    // 1. Verify Active Plan
    const activePlan = await resolveActivePlan(prisma, userId);
    if (!activePlan) {
      return res.status(403).json({
        success: false,
        message: 'Active subscription plan required to earn money from watching ads. Please choose a plan first.'
      });
    }

    // 2. Verify Daily Limit
    if (activePlan.adsWatchedToday >= activePlan.dailyLimit) {
      return res.status(400).json({
        success: false,
        message: `Daily limit reached! You have watched ${activePlan.adsWatchedToday}/${activePlan.dailyLimit} ads today.`
      });
    }

    // 3. Verify Ad Exists
    const ad = await prisma.ad.findUnique({ where: { id: adId } });
    if (!ad) {
      return res.status(404).json({ success: false, message: 'Ad not found.' });
    }

    // 4. Generate Challenge Ticket
    const challenge = createAdChallenge(userId, adId);

    return res.json({
      success: true,
      challengeToken: challenge.token,
      num1: challenge.num1,
      num2: challenge.num2,
      durationSeconds: ad.durationSeconds
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Complete Ad View & Disburse Reward to Earning Wallet (Atomic Transaction)
exports.completeAdView = async (req, res) => {
  try {
    const userId = req.userId; // injected by requireAuth middleware
    const {
      adId,
      watchedSeconds,
      mathAnswer,
      expectedAnswer,
      challengeToken
    } = req.body;

    const parsedAdId = parseInt(adId);
    if (!parsedAdId) {
      return res.status(400).json({ success: false, message: 'adId is required.' });
    }

    // Fetch ad details
    const ad = await prisma.ad.findUnique({
      where: { id: parsedAdId }
    });
    if (!ad) {
      return res.status(404).json({ success: false, message: 'Ad not found.' });
    }

    // 1. Verify Anti-Bot Security & Watch Time
    if (challengeToken) {
      // Secure token verification
      const verifyResult = verifyAdChallenge(
        challengeToken,
        userId,
        parsedAdId,
        mathAnswer,
        ad.durationSeconds
      );
      if (!verifyResult.valid) {
        return res.status(400).json({ success: false, message: verifyResult.message });
      }
    } else {
      // Legacy backward-compatible verification with strict check
      if (mathAnswer === undefined || expectedAnswer === undefined || parseInt(mathAnswer) !== parseInt(expectedAnswer)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid anti-bot verification answer. Please solve the calculation correctly.'
        });
      }
      if (watchedSeconds < ad.durationSeconds - 1) {
        return res.status(400).json({
          success: false,
          message: `Watch time requirement not met. You must watch the entire ${ad.durationSeconds} seconds of the ad to earn reward.`
        });
      }
    }

    const todayStr = getTodayString();

    // 2. Atomic Transaction: Check Active Plan, Daily & Lifetime Quotas, Update Counters & Disburse to Earning Wallet
    const result = await prisma.$transaction(async (tx) => {
      // Atomically fetch and validate active plan inside transaction
      const activePlan = await resolveActivePlan(tx, userId);

      if (!activePlan) {
        throw new Error('Active subscription plan required to earn money from watching ads. Please choose a plan first.');
      }

      if (activePlan.adsWatchedToday >= activePlan.dailyLimit) {
        throw new Error(`Daily limit reached! You have watched ${activePlan.adsWatchedToday}/${activePlan.dailyLimit} ads today.`);
      }

      if (activePlan.totalAdsQuota > 0 && activePlan.totalAdsWatched >= activePlan.totalAdsQuota) {
        await tx.userPlan.update({
          where: { id: activePlan.id },
          data: { status: 'Expired' }
        });
        throw new Error('Your plan has reached its total lifetime ads quota! Please upgrade or renew your plan.');
      }

      const earningRate = activePlan.earningPerAd;
      const newWatchedToday = activePlan.adsWatchedToday + 1;
      const newTotalWatched = activePlan.totalAdsWatched + 1;

      // Auto-expire if final ad of total quota
      const isQuotaDone = activePlan.totalAdsQuota > 0 && newTotalWatched >= activePlan.totalAdsQuota;

      // Update plan counters
      await tx.userPlan.update({
        where: { id: activePlan.id },
        data: {
          adsWatchedToday: newWatchedToday,
          totalAdsWatched: newTotalWatched,
          lastWatchDate: todayStr,
          status: isQuotaDone ? 'Expired' : 'Active'
        }
      });

      // Disburse reward strictly to EARNING WALLET
      await tx.wallet.upsert({
        where: { userId },
        update: { earningBalance: { increment: earningRate } },
        create: {
          userId,
          depositBalance: 0,
          earningBalance: earningRate,
          referralBalance: 0,
          rewardsBalance: 0
        }
      });

      const txId = 'AD-' + Math.floor(10000000 + Math.random() * 90000000);

      // Record in unified transactions ledger
      await tx.transaction.create({
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

      return {
        earningRate,
        newWatchedToday,
        dailyLimit: activePlan.dailyLimit,
        remainingToday: activePlan.dailyLimit - newWatchedToday,
        txId,
        isQuotaDone
      };
    });

    return res.json({
      success: true,
      message: `+₨ ${result.earningRate.toFixed(2)} disbursed to your Earning Wallet!`,
      rewardAmount: result.earningRate,
      adsWatchedToday: result.newWatchedToday,
      dailyLimit: result.dailyLimit,
      remainingToday: result.remainingToday,
      txId: result.txId,
      planExpired: result.isQuotaDone
    });

  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Simulate 24-hour daily limit reset
exports.simulateDailyReset = async (req, res) => {
  try {
    const userId = req.userId; // injected by requireAuth middleware
    const todayStr = getTodayString();

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
