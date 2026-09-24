const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || 'adpulse_secure_ad_token_key_2026';
// In-memory set of used challenge nonces to prevent replay attacks (cleared periodically)
const usedNonces = new Map();

// Periodic cleanup of expired nonces (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [nonce, expiresAt] of usedNonces.entries()) {
    if (now > expiresAt) {
      usedNonces.delete(nonce);
    }
  }
}, 10 * 60 * 1000);

/**
 * Creates a cryptographically signed ad viewing challenge ticket
 */
function createAdChallenge(userId, adId) {
  const num1 = Math.floor(Math.random() * 9) + 1;
  const num2 = Math.floor(Math.random() * 9) + 1;
  const expectedAnswer = num1 + num2;
  const startedAt = Date.now();
  const expiresAt = startedAt + 10 * 60 * 1000; // 10 minutes validity
  const nonce = crypto.randomBytes(8).toString('hex');

  const payload = {
    userId: Number(userId),
    adId: Number(adId),
    num1,
    num2,
    expectedAnswer,
    startedAt,
    expiresAt,
    nonce
  };

  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(payloadStr)
    .digest('base64url');

  const token = `${payloadStr}.${signature}`;

  return {
    token,
    num1,
    num2,
    startedAt
  };
}

/**
 * Verifies an ad challenge token against server constraints
 */
function verifyAdChallenge(token, userId, adId, answer, durationSeconds = 10) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, message: 'Invalid or missing ad security session token.' };
  }

  const [payloadStr, signature] = token.split('.');
  const expectedSignature = crypto
    .createHmac('sha256', SECRET)
    .update(payloadStr)
    .digest('base64url');

  if (signature !== expectedSignature) {
    return { valid: false, message: 'Security token tampering detected.' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, message: 'Malformed security payload.' };
  }

  // 1. Verify user & ad match
  if (payload.userId !== Number(userId) || payload.adId !== Number(adId)) {
    return { valid: false, message: 'Security session belongs to a different ad or user.' };
  }

  // 2. Check token expiration
  const now = Date.now();
  if (now > payload.expiresAt) {
    return { valid: false, message: 'Ad session expired. Please start the ad again.' };
  }

  // 3. Prevent replay attacks
  if (usedNonces.has(payload.nonce)) {
    return { valid: false, message: 'Ad session already redeemed. Replay prevented.' };
  }

  // 4. Server-side elapsed watch time check
  const elapsedSeconds = (now - payload.startedAt) / 1000;
  if (elapsedSeconds < durationSeconds - 1) {
    return {
      valid: false,
      message: `Full ad duration requirement not met. Watched ${Math.round(elapsedSeconds)}s of required ${durationSeconds}s.`
    };
  }

  // 5. Verify Anti-Bot Math Answer
  if (Number(answer) !== payload.expectedAnswer) {
    return {
      valid: false,
      message: `Incorrect calculation answer. Expected ${payload.num1} + ${payload.num2} = ${payload.expectedAnswer}.`
    };
  }

  // Mark nonce as used
  usedNonces.set(payload.nonce, payload.expiresAt);

  return { valid: true };
}

module.exports = {
  createAdChallenge,
  verifyAdChallenge
};
