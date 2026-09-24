// Central JWT configuration shared by authController.js and the auth middleware.
// The app refuses to start without a strong secret: no hardcoded fallback.

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error(
        'JWT_SECRET environment variable must be set to a random string of at least 32 characters. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
}

module.exports = {
    JWT_SECRET,
    JWT_ALGORITHM: 'HS256',
    JWT_ISSUER: 'adpulse-api',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d'
};