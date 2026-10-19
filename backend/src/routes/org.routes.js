// Organization, membership and invite management (the B2B part).
const crypto = require('crypto');
const router = require('express').Router();
const { z } = require('zod');
const { getDb } = require('../db');
const auth = require('../services/authService');
const repo = require('../services/claimsRepository');
const { HttpError } = require('../utils/httpError');
const { authenticate, requireOrg, requireRole } = require('../middleware/auth');

const role = z.enum(['admin', 'reviewer', 'viewer']);
const fullName = z.string().trim().min(2, 'Enter your full name.').max(80);
const nowIso = () => new Date().toISOString();

const bootstrapSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('create'), orgName: z.string().trim().min(2, 'Enter the hospital name.').max(80), fullName }),
  z.object({ mode: z.literal('join'), code: z.string().trim().min(6).max(40), fullName }),
]);
const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address.'), role });

router.get('/me', authenticate, (req, res) => res.json({ user: req.user, membership: req.membership }));

// First sign-in: create a new organization (you become its admin) or join one with an invite code.
router.post('/org/bootstrap', authenticate, async (req, res, next) => {
  try {
    if (req.membership) throw new HttpError(409, 'You already belong to an organization.');
    const body = bootstrapSchema.parse(req.body);
    const db = getDb();

    if (body.mode === 'create') {
      const orgId = crypto.randomUUID();
      db.transaction(() => {
        db.prepare('INSERT INTO organizations (id, name) VALUES (?,?)').run(orgId, body.orgName);
        db.prepare('INSERT INTO memberships (user_id, org_id, role, full_name) VALUES (?,?,?,?)').run(req.user.id, orgId, 'admin', body.fullName);
      })();
      await repo.audit({ orgId, userId: req.user.id, action: 'org_created', detail: { name: body.orgName } });
      return res.status(201).json({ ok: true });
    }

    const inv = db.prepare('SELECT * FROM invites WHERE code = ? AND used_at IS NULL AND expires_at > ?').get(body.code, nowIso());
    // Tied to an email address: a leaked code is useless to anyone else.
    if (!inv || inv.email.toLowerCase() !== req.user.email.toLowerCase()) {
      throw new HttpError(400, 'This invite code is invalid, expired, or was issued for a different email address.');
    }
    db.transaction(() => {
      const used = db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE id = ? AND used_at IS NULL').run(req.user.id, nowIso(), inv.id);
      if (used.changes !== 1) throw new HttpError(400, 'This invite code was already used.');
      db.prepare('INSERT INTO memberships (user_id, org_id, role, full_name) VALUES (?,?,?,?)').run(req.user.id, inv.org_id, inv.role, body.fullName);
    })();
    await repo.audit({ orgId: inv.org_id, userId: req.user.id, action: 'member_joined', detail: { role: inv.role } });
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

const adminOnly = [authenticate, requireOrg, requireRole('admin')];

router.get('/org/members', ...adminOnly, (req, res, next) => {
  try {
    res.json(getDb().prepare(
      'SELECT m.user_id, m.role, m.full_name, m.created_at, u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.created_at'
    ).all(req.orgId));
  } catch (e) { next(e); }
});

router.post('/org/invites', ...adminOnly, async (req, res, next) => {
  try {
    const body = inviteSchema.parse(req.body);
    const code = crypto.randomBytes(6).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    getDb().prepare('INSERT INTO invites (id, org_id, email, role, code, created_by, expires_at) VALUES (?,?,?,?,?,?,?)')
      .run(crypto.randomUUID(), req.orgId, body.email, body.role, code, req.user.id, expires);
    await repo.audit({ orgId: req.orgId, userId: req.user.id, action: 'member_invited', detail: { email: body.email, role: body.role } });
    res.status(201).json({ code, email: body.email, role: body.role, expires_at: expires });
  } catch (e) { next(e); }
});

router.patch('/org/members/:userId', ...adminOnly, async (req, res, next) => {
  try {
    if (req.params.userId === req.user.id) throw new HttpError(400, 'You cannot change your own role.');
    const { role: newRole } = z.object({ role }).parse(req.body);
    const r = getDb().prepare('UPDATE memberships SET role = ? WHERE user_id = ? AND org_id = ?').run(newRole, req.params.userId, req.orgId);
    if (!r.changes) throw new HttpError(404, 'Member not found.');
    await repo.audit({ orgId: req.orgId, userId: req.user.id, action: 'member_role_changed', detail: { member: req.params.userId, role: newRole } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/org/members/:userId/password', ...adminOnly, async (req, res, next) => {
  try {
    if (req.params.userId === req.user.id) throw new HttpError(400, 'Use the Account page to change your own password.');
    const { newPassword } = z.object({ newPassword: z.string().min(10, 'Use a password of at least 10 characters.').max(128) }).parse(req.body);
    const member = getDb().prepare('SELECT 1 FROM memberships WHERE user_id = ? AND org_id = ?').get(req.params.userId, req.orgId);
    if (!member) throw new HttpError(404, 'Member not found.');
    await auth.adminSetPassword(req.params.userId, newPassword);
    await repo.audit({ orgId: req.orgId, userId: req.user.id, action: 'member_password_reset', detail: { member: req.params.userId } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/org/members/:userId', ...adminOnly, async (req, res, next) => {
  try {
    if (req.params.userId === req.user.id) throw new HttpError(400, 'You cannot remove yourself.');
    const r = getDb().prepare('DELETE FROM memberships WHERE user_id = ? AND org_id = ?').run(req.params.userId, req.orgId);
    if (!r.changes) throw new HttpError(404, 'Member not found.');
    auth.destroyUserSessions(req.params.userId);
    await repo.audit({ orgId: req.orgId, userId: req.user.id, action: 'member_removed', detail: { member: req.params.userId } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
