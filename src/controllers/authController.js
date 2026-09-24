const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const {
  JWT_SECRET,
  JWT_ALGORITHM,
  JWT_ISSUER,
  JWT_EXPIRES_IN
} = require('../config/jwt');

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72; // bcrypt silently truncates beyond 72 bytes
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_REGEX = /^\+?[0-9\s\-()]{7,20}$/;

// Used to keep login timing the same whether or not the email exists
const DUMMY_HASH = bcrypt.hashSync('adpulse-dummy-password', BCRYPT_ROUNDS);

const GENERIC_SERVER_ERROR = 'Something went wrong. Please try again later.';
const INVALID_CREDENTIALS = 'Invalid email or password. Please verify your credentials.';

function generateAuthToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { algorithm: JWT_ALGORITHM, issuer: JWT_ISSUER, expiresIn: JWT_EXPIRES_IN }
  );
}

function isString(v) {
  return typeof v === 'string';
}

function serializeUser(user) {
  return {
    id: user.id,
    full_name: user.fullName,
    email: user.email,
    mobile: user.mobile,
    country: user.country,
    referral_code: user.referralCode,
    referred_by: user.referredBy,
    created_at: user.createdAt
  };
}

// Cryptographically secure referral code (EARN + 6 chars)
function generateRandomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'EARN';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(crypto.randomInt(chars.length));
  }
  return code;
}

// Generate unique referral code with collision check
async function getUniqueReferralCode(tx) {
  for (let attempts = 0; attempts < 20; attempts++) {
    const candidate = generateRandomCode();
    const existing = await tx.user.findUnique({
      where: { referralCode: candidate }
    });
    if (!existing) return candidate;
  }
  // Extremely unlikely; fall back to a long random suffix instead of a guessable timestamp
  return 'EARN' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

// Unpredictable, collision-resistant transaction IDs (12 digits)
function generateTxId(prefix) {
  return `${prefix}-${crypto.randomInt(100000000000, 1000000000000)}`;
}

function validatePassword(password) {
  if (!isString(password) || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return `Password must be at most ${MAX_PASSWORD_BYTES} bytes long.`;
  }
  return null;
}

// Register user with encrypted password
exports.register = async (req, res) => {
  try {
    const {
      full_name,
      email,
      password,
      mobile,
      country,
      referral_code: inputReferral
    } = req.body || {};

    if (![full_name, email, password, mobile, country].every(isString) ||
      !full_name || !email || !password || !mobile || !country) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, password, mobile number, and country are required.'
      });
    }
    if (inputReferral !== undefined && inputReferral !== null && !isString(inputReferral)) {
      return res.status(400).json({ success: false, message: 'Invalid referral code.' });
    }

    const trimmedName = full_name.trim();
    const cleanEmail = email.toLowerCase().trim();
    const cleanMobile = mobile.trim();
    const cleanCountry = country.trim();

    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Full name must be between 2 and 100 characters long.'
      });
    }

    // Length cap first: also protects the regex from pathological input
    if (cleanEmail.length > 254 || !EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    if (!MOBILE_REGEX.test(cleanMobile)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid mobile number.'
      });
    }

    if (cleanCountry.length < 2 || cleanCountry.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid country.'
      });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    const emailTakenResponse = () =>
      res.status(409).json({
        success: false,
        message: 'An account with this email address already exists. Please log in.'
      });

    // Fast-path duplicate check (the DB unique constraint below is the real guard)
    const existing = await prisma.user.findUnique({
      where: { email: cleanEmail },
      select: { id: true }
    });
    if (existing) return emailTakenResponse();

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Atomic transaction for user creation, wallet provisioning, welcome bonus, and referral commission
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        // Verify referrer if provided
        let validReferrer = null;
        let referrerUser = null;
        if (inputReferral && inputReferral.trim().length > 0 && inputReferral.length <= 20) {
          const cleanedRef = inputReferral.trim().toUpperCase();
          referrerUser = await tx.user.findUnique({
            where: { referralCode: cleanedRef }
          });
          if (referrerUser) {
            validReferrer = referrerUser.referralCode;
          }
        }

        const generatedRef = await getUniqueReferralCode(tx);

        // 1. Create User with hashed password
        const user = await tx.user.create({
          data: {
            fullName: trimmedName,
            email: cleanEmail,
            mobile: cleanMobile,
            country: cleanCountry,
            referralCode: generatedRef,
            referredBy: validReferrer,
            passwordHash
          }
        });

        // 2. Create wallets with ₨ 100 Welcome Bonus in Rewards Wallet
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
        await tx.transaction.create({
          data: {
            userId: user.id,
            txId: generateTxId('TX'),
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

          await tx.transaction.create({
            data: {
              userId: referrerUser.id,
              txId: generateTxId('REF'),
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
    } catch (txError) {
      // Unique-constraint violation: concurrent signup with the same email
      if (txError && txError.code === 'P2002') {
        if (String(txError.meta && txError.meta.target).includes('email')) {
          return emailTakenResponse();
        }
        return res.status(503).json({
          success: false,
          message: 'Could not complete registration. Please try again.'
        });
      }
      throw txError;
    }

    const token = generateAuthToken(result);

    return res.status(201).json({
      success: true,
      message: 'Account successfully registered! ₨ 100 welcome bonus credited to your Rewards Wallet.',
      token,
      user: serializeUser(result)
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ success: false, message: GENERIC_SERVER_ERROR });
  }
};

// Login user (email and password authentication)
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!isString(email) || !isString(password) || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Both email address and password are required to sign in.'
      });
    }
    // Cap input size so oversized payloads can't be used to burn CPU
    if (email.length > 254 || password.length > 1024) {
      return res.status(401).json({ success: false, message: INVALID_CREDENTIALS });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    // Always run a bcrypt comparison so response time doesn't reveal whether the email exists.
    // (bcrypt.compare returns false for any non-bcrypt hash, e.g. the old 'hashed_pwd' stubs.)
    const isPasswordValid = await bcrypt.compare(
      password,
      user ? user.passwordHash : DUMMY_HASH
    );

    if (!user || !isPasswordValid) {
      return res.status(401).json({ success: false, message: INVALID_CREDENTIALS });
    }

    const token = generateAuthToken(user);

    return res.json({
      success: true,
      message: `Welcome back, ${user.fullName}!`,
      token,
      user: serializeUser(user)
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: GENERIC_SERVER_ERROR });
  }
};

// Get current profile — userId sourced from JWT middleware (req.userId)
exports.getProfile = async (req, res) => {
  try {
    const userId = req.userId; // injected by requireAuth middleware

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, user: serializeUser(user) });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ success: false, message: GENERIC_SERVER_ERROR });
  }
};

// Update profile (Email is strictly uneditable per requirement)
// userId sourced from JWT middleware (req.userId) — cannot be spoofed from request body
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.userId; // injected by requireAuth middleware
    const { full_name, mobile, country, current_password, new_password } = req.body || {};

    if (![full_name, mobile, country].every(isString) || !full_name || !mobile || !country) {
      return res.status(400).json({ success: false, message: 'Full name, mobile and country are required.' });
    }

    const trimmedName = full_name.trim();
    const cleanMobile = mobile.trim();
    const cleanCountry = country.trim();

    if (trimmedName.length < 2 || trimmedName.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Full name must be between 2 and 100 characters long.'
      });
    }
    if (!MOBILE_REGEX.test(cleanMobile)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid mobile number.' });
    }
    if (cleanCountry.length < 2 || cleanCountry.length > 100) {
      return res.status(400).json({ success: false, message: 'Please provide a valid country.' });
    }

    const updateData = {
      fullName: trimmedName,
      mobile: cleanMobile,
      country: cleanCountry
    };

    // Optional password update
    if (new_password !== undefined && new_password !== null && new_password !== '') {
      if (!isString(new_password)) {
        return res.status(400).json({ success: false, message: 'Invalid new password.' });
      }
      if (!isString(current_password) || !current_password) {
        return res.status(400).json({
          success: false,
          message: 'Current password is required to set a new password.'
        });
      }
      if (current_password.length > 1024) {
        return res.status(400).json({
          success: false,
          message: 'Current password does not match. Please try again.'
        });
      }

      const passwordError = validatePassword(new_password);
      if (passwordError) {
        return res.status(400).json({ success: false, message: passwordError });
      }

      const existingUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!existingUser) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      const isMatch = await bcrypt.compare(current_password, existingUser.passwordHash);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Current password does not match. Please try again.'
        });
      }

      updateData.passwordHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    return res.json({
      success: true,
      message: 'Profile updated successfully. (Note: Email remains permanently bound and locked).',
      user: serializeUser(updated)
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ success: false, message: GENERIC_SERVER_ERROR });
  }
};