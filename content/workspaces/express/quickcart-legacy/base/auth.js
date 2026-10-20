// Tokens and the auth middleware.
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, is_admin: user.is_admin }, SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, SECRET);
  } catch (e) {
    console.log('auth: token did not verify:', e.message);
  }
  next();
}

function adminOnly(req, res, next) {
  if (req.user && req.user.is_admin) {
    return next();
  }
  return res.status(403).json({ error: 'admin only' });
}

module.exports = { signToken, authMiddleware, adminOnly };
