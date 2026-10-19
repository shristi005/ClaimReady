// Authentication + authorization for every protected route.
// The organization and role always come from the database, never from the request.
const auth = require('../services/authService');

function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    const s = auth.getSession(token);
    if (!s) return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    req.user = s.user;
    req.membership = s.membership;
    req.token = token;
    next();
  } catch (e) {
    next(e);
  }
}

function requireOrg(req, res, next) {
  if (!req.membership) return res.status(403).json({ error: 'Create or join an organization first.' });
  req.orgId = req.membership.org_id;
  req.role = req.membership.role;
  next();
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.role) ? next() : res.status(403).json({ error: 'You do not have permission to do this.' });

module.exports = { authenticate, requireOrg, requireRole };
