const prisma = require('../config/prisma');
const { getTodayString } = require('../utils/planHelper');

const GATEWAY_LIMITS = {
  JazzCash: { min: 500, max: 100000 },
  EasyPaisa: { min: 500, max: 100000 },
  'Bank Transfer': { min: 1000, max: 500000 }
};

// Get 4 distinct wallet balances + aggregate Total Balance
exports.getWallets = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId) || 1;

    let wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          userId,
          depositBalance: 0,
          earningBalance: 0,
          referralBalance: 0,
          rewardsBalance: 0
        }
      });
    }

    const deposit = wallet.depositBalance;
    const earning = wallet.earningBalance;
    const referral = wallet.referralBalance;
    const rewards = wallet.rewardsBalance;
    const totalBalance = deposit + earning + referral + rewards;

    return res.json({
      success: true,
      wallets: {
        deposit_balance: deposit,
        earning_balance: earning,
        referral_balance: referral,
        rewards_balance: rewards,
        total_balance: totalBalance
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Deposit funds to Deposit Wallet (Atomic Transaction)
exports.deposit = async (req, res) => {
  try {
    const userId = parseInt(req.body.userId) || 1;
    const { amount, gateway, sender_number, trx_reference } = req.body;
    const numAmount = parseFloat(amount);

    if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Please enter a valid deposit amount.' });
    }

    if (!gateway || !sender_number || !trx_reference) {
      return res.status(400).json({
        success: false,
        message: 'Payment gateway, sender mobile/account, and transaction ID are required.'
      });
    }

    // Gateway constraints
    const limits = GATEWAY_LIMITS[gateway] || { min: 500, max: 100000 };
    if (numAmount < limits.min) {
      return res.status(400).json({
        success: false,
        message: `Minimum deposit for ${gateway} is ₨ ${limits.min.toLocaleString()}.`
      });
    }
    if (numAmount > limits.max) {
      return res.status(400).json({
        success: false,
        message: `Maximum deposit for ${gateway} is ₨ ${limits.max.toLocaleString()} per transaction.`
      });
    }

    const txId = 'DEP-' + Math.floor(10000000 + Math.random() * 90000000);

    // Atomic transaction for deposit
    await prisma.$transaction(async (tx) => {
      // 1. Record Deposit entry
      await tx.deposit.create({
        data: {
          userId,
          txId,
          amount: numAmount,
          gateway,
          senderNumber: sender_number.trim(),
          trxReference: trx_reference.trim(),
          status: 'Completed'
        }
      });

      // 2. Credit Deposit Wallet
      await tx.wallet.upsert({
        where: { userId },
        update: { depositBalance: { increment: numAmount } },
        create: {
          userId,
          depositBalance: numAmount,
          earningBalance: 0,
          referralBalance: 0,
          rewardsBalance: 0
        }
      });

      // 3. Record in unified transactions ledger
      await tx.transaction.create({
        data: {
          userId,
          txId,
          type: 'Deposit',
          targetWallet: 'Deposit',
          amount: numAmount,
          description: `${gateway} deposit verified (Ref: ${trx_reference.trim()})`,
          gateway,
          status: 'Completed'
        }
      });
    });

    return res.json({
      success: true,
      message: `Successfully deposited ₨ ${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} via ${gateway} to your Deposit Wallet!`,
      txId
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Withdraw funds - STRICT REQUIREMENT: Exclusively from "Earning Wallet"! (Atomic Transaction)
exports.withdraw = async (req, res) => {
  try {
    const userId = parseInt(req.body.userId) || 1;
    const { amount, method, account_title, account_number } = req.body;
    const numAmount = parseFloat(amount);

    if (!numAmount || isNaN(numAmount) || numAmount < 300) {
      return res.status(400).json({ success: false, message: 'Minimum withdrawal amount is ₨ 300.' });
    }
    if (numAmount > 50000) {
      return res.status(400).json({ success: false, message: 'Maximum single withdrawal is ₨ 50,000.' });
    }
    if (!method || !account_title || !account_number) {
      return res.status(400).json({
        success: false,
        message: 'Payout method, account holder title, and mobile/account number are required.'
      });
    }

    const txId = 'WTH-' + Math.floor(10000000 + Math.random() * 90000000);

    // Atomic transaction for withdrawal
    const remainingBalance = await prisma.$transaction(async (tx) => {
      // 1. Fetch locked wallet state
      const wallet = await tx.wallet.findUnique({
        where: { userId }
      });

      const currentEarning = wallet ? wallet.earningBalance : 0;

      // 2. Strict check: Funds can ONLY come from Earning Wallet!
      if (currentEarning < numAmount) {
        throw new Error(
          `Insufficient Earning Wallet balance. You have ₨ ${currentEarning.toLocaleString('en-US', { minimumFractionDigits: 2 })} available. Note: Withdrawals are strictly permitted from your Earning Wallet only.`
        );
      }

      // 3. Deduct from Earning Wallet
      const updated = await tx.wallet.update({
        where: { userId },
        data: { earningBalance: { decrement: numAmount } }
      });

      // 4. Record Withdrawal record
      await tx.withdrawal.create({
        data: {
          userId,
          txId,
          amount: numAmount,
          method,
          accountTitle: account_title.trim(),
          accountNumber: account_number.trim(),
          status: 'Completed'
        }
      });

      // 5. Record in unified transactions ledger
      await tx.transaction.create({
        data: {
          userId,
          txId,
          type: 'Withdrawal',
          targetWallet: 'Earning',
          amount: -numAmount,
          description: `Withdrawal to ${method} (${account_title.trim()} - ${account_number.trim()})`,
          gateway: method,
          status: 'Completed'
        }
      });

      return updated.earningBalance;
    });

    return res.json({
      success: true,
      message: `Withdrawal of ₨ ${numAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} processed successfully to ${account_title} via ${method}!`,
      txId,
      remainingEarningBalance: remainingBalance
    });

  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Claim Daily Login Streak Bonus (Rewards Wallet)
exports.claimDailyStreak = async (req, res) => {
  try {
    const userId = parseInt(req.body.userId) || 1;
    const STREAK_REWARD = 25.0; // ₨ 25 Daily streak reward
    const todayStr = getTodayString();

    const result = await prisma.$transaction(async (tx) => {
      // Check if user already claimed today
      const todayStart = new Date(todayStr + 'T00:00:00.000Z');
      const alreadyClaimed = await tx.transaction.findFirst({
        where: {
          userId,
          type: 'Rewards',
          description: { contains: 'Daily Login Streak Bonus' },
          createdAt: { gte: todayStart }
        }
      });

      if (alreadyClaimed) {
        throw new Error('Daily login streak bonus already claimed for today! Return tomorrow to keep your streak alive.');
      }

      // Credit Rewards Wallet
      const updated = await tx.wallet.upsert({
        where: { userId },
        update: { rewardsBalance: { increment: STREAK_REWARD } },
        create: {
          userId,
          depositBalance: 0,
          earningBalance: 0,
          referralBalance: 0,
          rewardsBalance: STREAK_REWARD
        }
      });

      const txId = 'STRK-' + Math.floor(10000000 + Math.random() * 90000000);

      // Log transaction
      await tx.transaction.create({
        data: {
          userId,
          txId,
          type: 'Rewards',
          targetWallet: 'Rewards',
          amount: STREAK_REWARD,
          description: `Daily Login Streak Bonus (Claimed ${todayStr})`,
          gateway: 'Streak Engine',
          status: 'Completed'
        }
      });

      return { txId, rewardsBalance: updated.rewardsBalance };
    });

    return res.json({
      success: true,
      message: `+₨ ${STREAK_REWARD.toFixed(2)} Daily Streak Bonus added to your Rewards Wallet!`,
      rewardAmount: STREAK_REWARD,
      newRewardsBalance: result.rewardsBalance,
      txId: result.txId
    });

  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Unified Transaction History / Financial Ledger (Filterable by type)
exports.getTransactions = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId) || 1;
    const filterType = req.query.type || 'All';
    const limit = parseInt(req.query.limit) || 50;

    const whereClause = { userId };
    if (filterType !== 'All') {
      whereClause.type = filterType;
    }

    const txList = await prisma.transaction.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100)
    });

    return res.json({
      success: true,
      transactions: txList.map(t => ({
        id: t.id,
        tx_id: t.txId,
        type: t.type,
        target_wallet: t.targetWallet,
        amount: t.amount,
        description: t.description,
        gateway: t.gateway,
        status: t.status,
        created_at: t.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
