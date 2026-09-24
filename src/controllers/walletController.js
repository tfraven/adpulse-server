const prisma = require('../config/prisma');

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

// Deposit funds to Deposit Wallet
exports.deposit = async (req, res) => {
  try {
    const userId = parseInt(req.body.userId) || 1;
    const { amount, gateway, sender_number, trx_reference } = req.body;
    const numAmount = parseFloat(amount);

    if (!numAmount || isNaN(numAmount) || numAmount < 500) {
      return res.status(400).json({ success: false, message: 'Minimum deposit is ₨ 500.' });
    }
    if (numAmount > 100000) {
      return res.status(400).json({ success: false, message: 'Maximum deposit is ₨ 100,000 per transaction.' });
    }
    if (!gateway || !sender_number || !trx_reference) {
      return res.status(400).json({ success: false, message: 'Gateway, sender number, and transaction ID are required.' });
    }

    const txId = 'DEP-' + Math.floor(10000000 + Math.random() * 90000000);

    // Record Deposit
    await prisma.deposit.create({
      data: {
        userId,
        txId,
        amount: numAmount,
        gateway,
        senderNumber: sender_number,
        trxReference: trx_reference,
        status: 'Completed'
      }
    });

    // Credit Deposit Wallet
    await prisma.wallet.upsert({
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

    // Record in unified transactions ledger
    await prisma.transaction.create({
      data: {
        userId,
        txId,
        type: 'Deposit',
        targetWallet: 'Deposit',
        amount: numAmount,
        description: `${gateway} deposit verified (TID: ${trx_reference})`,
        gateway,
        status: 'Completed'
      }
    });

    return res.json({
      success: true,
      message: `Successfully deposited ₨ ${numAmount.toFixed(2)} via ${gateway} to your Deposit Wallet!`,
      txId
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Withdraw funds - STRICT REQUIREMENT: Exclusively from "Earning Wallet"!
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
      return res.status(400).json({ success: false, message: 'Method, account holder title, and account number are required.' });
    }

    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    const currentEarning = wallet ? wallet.earningBalance : 0;

    // Enforce: funds can ONLY come from Earning Wallet!
    if (currentEarning < numAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient Earning Wallet balance. You have ₨ ${currentEarning.toFixed(2)} available. Note: Withdrawals are strictly permitted from your Earning Wallet only.`
      });
    }

    const txId = 'WTH-' + Math.floor(10000000 + Math.random() * 90000000);

    // Deduct from Earning Wallet
    await prisma.wallet.update({
      where: { userId },
      data: { earningBalance: { decrement: numAmount } }
    });

    // Record Withdrawal
    await prisma.withdrawal.create({
      data: {
        userId,
        txId,
        amount: numAmount,
        method,
        accountTitle: account_title,
        accountNumber: account_number,
        status: 'Completed'
      }
    });

    // Record in unified transactions ledger
    await prisma.transaction.create({
      data: {
        userId,
        txId,
        type: 'Withdrawal',
        targetWallet: 'Earning',
        amount: -numAmount,
        description: `Withdrawal to ${method} (${account_title} - ${account_number})`,
        gateway: method,
        status: 'Completed'
      }
    });

    return res.json({
      success: true,
      message: `Withdrawal of ₨ ${numAmount.toFixed(2)} processed successfully to ${account_title} via ${method}!`,
      txId,
      remainingEarningBalance: currentEarning - numAmount
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Unified Transaction History / Financial Ledger (Filterable by type)
exports.getTransactions = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId) || 1;
    const filterType = req.query.type || 'All';

    const whereClause = { userId };
    if (filterType !== 'All') {
      whereClause.type = filterType;
    }

    const txList = await prisma.transaction.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 50
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
