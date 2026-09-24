const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_ALGORITHM, JWT_ISSUER } = require('../config/jwt');

function unauthorized(res, message) {
  res.set('WWW-Authenticate', 'Bearer');
  return res.status(401).json({ success: false, message });
}

/**
 * JWT Authentication Middleware
 * Verifies the Bearer token and injects req.userId (integer) + req.userEmail.
 * Rejects requests with missing, malformed, or expired tokens.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string') {
    return unauthorized(res, 'Authentication required. Please sign in to continue.');
  }

  // Expect exactly: "Bearer <token>" (scheme is case-insensitive per RFC 7235)
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) {
    return unauthorized(res, 'Authentication required. Please sign in to continue.');
  }
  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM], // pin the algorithm; blocks alg confusion / "none"
      issuer: JWT_ISSUER
    });

    if (!Number.isInteger(decoded.userId) || decoded.userId <= 0) {
      return unauthorized(res, 'Invalid authentication token. Please sign in again.');
    }

    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return unauthorized(res, 'Your session has expired. Please sign in again.');
    }
    return unauthorized(res, 'Invalid authentication token. Please sign in again.');
  }
}

module.exports = { requireAuth };