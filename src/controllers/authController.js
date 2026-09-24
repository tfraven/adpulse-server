const prisma = require('../config/prisma');

// Helper to generate unique referral code
function generateRandomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'EARN';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate unique referral code with collision check
async function getUniqueReferralCode(tx) {
  let attempts = 0;
  while (attempts < 20) {
    const candidate = generateRandomCode();
    const existing = await tx.user.findUnique({
      where: { referralCode: candidate }
    });
    if (!existing) return candidate;
    attempts++;
  }
  // Fallback with timestamp suffix
  return 'EARN' + Date.now().toString().slice(-4);
}

// Register user
exports.register = async (req, res) => {
  try {
    const { full_name, email, mobile, country, referral_code: inputReferral } = req.body;

    if (!full_name || !email || !mobile || !country) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, mobile number, and country are required.'
      });
    }

    const trimmedName = full_name.trim();
    const cleanEmail = email.toLowerCase().trim();
    const cleanMobile = mobile.trim();
    const cleanCountry = country.trim();

    if (trimmedName.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Full name must be at least 2 characters long.'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email address already exists. Please log in.'
      });
    }

    // Atomic transaction for user creation, wallet provisioning, welcome bonus, and referral commission
    const result = await prisma.$transaction(async (tx) => {
      // Verify referrer if provided
      let validReferrer = null;
      let referrerUser = null;
      if (inputReferral) {
        const cleanedRef = inputReferral.trim().toUpperCase();
        referrerUser = await tx.user.findUnique({
          where: { referralCode: cleanedRef }
        });
        if (referrerUser) {
          validReferrer = referrerUser.referralCode;
        }
      }

      const generatedRef = await getUniqueReferralCode(tx);

      // 1. Create User
      const user = await tx.user.create({
        data: {
          fullName: trimmedName,
          email: cleanEmail,
          mobile: cleanMobile,
          country: cleanCountry,
          referralCode: generatedRef,
          referredBy: validReferrer,
          passwordHash: 'hashed_pwd'
        }
      });

      // 2. Create 4 distinct wallets with ₨ 100 Welcome Bonus in Rewards Wallet
      await tx.wallet.create({
        data: {
          userId: user.id,
          depositBalance: 0.0,
          earningBalance: 0.0,
          referralBalance: 0.0,
          rewardsBalance: 100.0
        }
      });

      // 3. Log Welcome Bonus Transaction
      const welcomeTxId = 'TX-' + Math.floor(10000000 + Math.random() * 90000000);
      await tx.transaction.create({
        data: {
          userId: user.id,
          txId: welcomeTxId,
          type: 'Rewards',
          targetWallet: 'Rewards',
          amount: 100.0,
          description: 'New Account Welcome Sign-up Bonus',
          gateway: 'Rewards Engine',
          status: 'Completed'
        }
      });

      // 4. Credit referrer ₨ 50 commission to Referral Wallet if referred
      if (referrerUser && validReferrer) {
        await tx.wallet.update({
          where: { userId: referrerUser.id },
          data: { referralBalance: { increment: 50.0 } }
        });

        const refTxId = 'REF-' + Math.floor(10000000 + Math.random() * 90000000);
        await tx.transaction.create({
          data: {
            userId: referrerUser.id,
            txId: refTxId,
            type: 'Referral',
            targetWallet: 'Referral',
            amount: 50.0,
            description: `Sign-up referral commission from ${trimmedName}`,
            gateway: 'Referral Engine',
            status: 'Completed'
          }
        });
      }

      return user;
    });

    return res.json({
      success: true,
      message: 'Account successfully registered! ₨ 100 welcome bonus credited to your Rewards Wallet.',
      user: {
        id: result.id,
        full_name: result.fullName,
        email: result.email,
        mobile: result.mobile,
        country: result.country,
        referral_code: result.referralCode,
        referred_by: result.referredBy,
        created_at: result.createdAt
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Login user (email-based identifier)
exports.login = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required to sign in.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No registered account found with this email address. Please register a new account.'
      });
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
        fullName: full_name.trim(),
        mobile: mobile.trim(),
        country: country.trim()
      }
    });

    return res.json({
      success: true,
      message: 'Profile updated successfully. (Note: Email remains permanently bound and locked).',
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
