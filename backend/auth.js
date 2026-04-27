const crypto = require('node:crypto');

const tokenSecret = process.env.RPGBOT_TOKEN_SECRET || 'rpgbot-local-development-secret';
const tokenTtlMs = 1000 * 60 * 60 * 24 * 7;

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function base64UrlDecode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function sign(value) {
  return crypto.createHmac('sha256', tokenSecret).update(value).digest('base64url');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  const [salt, storedHash] = storedPassword.split(':');

  if (!salt || !storedHash) {
    return false;
  }

  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(storedHash, 'hex');

  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

function createToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    exp: Date.now() + tokenTtlMs
  };
  const body = base64UrlEncode(payload);

  return `${body}.${sign(body)}`;
}

function verifyToken(token) {
  const [body, signature] = String(token || '').split('.');

  if (!body || !signature || sign(body) !== signature) {
    return null;
  }

  try {
    const payload = base64UrlDecode(body);

    if (!payload.exp || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

module.exports = {
  createToken,
  hashPassword,
  verifyPassword,
  verifyToken
};
