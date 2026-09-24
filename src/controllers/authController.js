const prisma = require('../config/prisma');

// Helper to generate unique referral code
function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'EARN';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Register user
exports.register = async (req, res) => {
  try {
    const { full_name, email, mobile, country, referral_code: inputReferral } = req.body;

    if (!full_name || !email || !mobile || !country) {
      return res.status(400).json({ success: false, message: 'Full name, email, mobile, and country are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
    }

    // Verify referrer if provided
    let validReferrer = null;
    if (inputReferral) {
      const refUser = await prisma.user.findUnique({
        where: { referralCode: inputReferral.toUpperCase() }
      });
      if (refUser) {
        validReferrer = refUser.referralCode;
      }
    }

    const generatedRef = generateReferralCode();

    // Create User with Prisma
    const user = await prisma.user.create({
      data: {
        fullName: full_name,
        email: email.toLowerCase(),
        mobile,
        country,
        referralCode: generatedRef,
        referredBy: validReferrer,
        passwordHash: 'hashed_pwd'
      }
    });

    // Create 4 distinct wallets with ₨ 100 Welcome Bonus in Rewards Wallet
    await prisma.wallet.create({
      data: {
        userId: user.id,
        depositBalance: 0.0,
        earningBalance: 0.0,
        referralBalance: 0.0,
        rewardsBalance: 100.0
      }
    });

    // Log Welcome Bonus Transaction
    await prisma.transaction.create({
      data: {
        userId: user.id,
        txId: 'TX-' + Math.floor(1000000 + Math.random() * 9000000),
        type: 'Rewards',
        targetWallet: 'Rewards',
        amount: 100.0,
        description: 'New Account Welcome Sign-up Bonus',
        gateway: 'Rewards Engine',
        status: 'Completed'
      }
    });

    // Credit referrer ₨ 50 commission to Referral Wallet if referred
    if (validReferrer) {
      const refOwner = await prisma.user.findUnique({
        where: { referralCode: validReferrer }
      });
      if (refOwner) {
        await prisma.wallet.update({
          where: { userId: refOwner.id },
          data: { referralBalance: { increment: 50.0 } }
        });

        await prisma.transaction.create({
          data: {
            userId: refOwner.id,
            txId: 'TX-' + Math.floor(1000000 + Math.random() * 9000000),
            type: 'Referral',
            targetWallet: 'Referral',
            amount: 50.0,
            description: `Sign-up referral commission from ${full_name}`,
            gateway: 'Referral Engine',
            status: 'Completed'
          }
        });
      }
    }

    return res.json({
      success: true,
      message: 'Account successfully registered with unique referral code!',
      user: {
        id: user.id,
        full_name: user.fullName,
        email: user.email,
        mobile: user.mobile,
        country: user.country,
        referral_code: user.referralCode,
        referred_by: user.referredBy,
        created_at: user.createdAt
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Login user (email-based, no password required per spec)
exports.login = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required to sign in.' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'No registered account found with this email address. Please register a new account.' });
    }

    return res.json({
      success: true,
      message: `Welcome back, ${user.fullName}!`,
      user: {
        id: user.id,
        full_name: user.fullName,
        email: user.email,
        mobile: user.mobile,
        country: user.country,
        referral_code: user.referralCode,
        referred_by: user.referredBy,
        created_at: user.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get current profile
exports.getProfile = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        full_name: user.fullName,
        email: user.email,
        mobile: user.mobile,
        country: user.country,
        referral_code: user.referralCode,
        referred_by: user.referredBy,
        created_at: user.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update profile (Email is strictly uneditable per requirement)
exports.updateProfile = async (req, res) => {
  try {
    const userId = parseInt(req.body.userId);
    const { full_name, mobile, country } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required.' });
    }

    if (!full_name || !mobile || !country) {
      return res.status(400).json({ success: false, message: 'Full name, mobile and country are required.' });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        fullName: full_name,
        mobile,
        country
      }
    });

    return res.json({
      success: true,
      message: 'Profile updated successfully. Note: Email remains locked and unchanged.',
      user: {
        id: updated.id,
        full_name: updated.fullName,
        email: updated.email,
        mobile: updated.mobile,
        country: updated.country,
        referral_code: updated.referralCode,
        created_at: updated.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
