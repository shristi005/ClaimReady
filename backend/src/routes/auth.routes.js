const router = require('express').Router();
const { z } = require('zod');
const auth = require('../services/authService');
const { authenticate } = require('../middleware/auth');

const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(200);
const newPassword = z.string().min(10, 'Use a password of at least 10 characters.').max(128, 'That password is too long.');

router.post('/auth/register', async (req, res, next) => {
  try {
    const body = z.object({ email, password: newPassword }).parse(req.body);
    res.status(201).json(await auth.register(body.email, body.password));
  } catch (e) { next(e); }
});

router.post('/auth/login', async (req, res, next) => {
  try {
    const body = z.object({ email, password: z.string().min(1, 'Enter your password.').max(128) }).parse(req.body);
    res.json(await auth.login(body.email, body.password));
  } catch (e) { next(e); }
});

router.post('/auth/logout', authenticate, (req, res) => {
  auth.destroySession(req.token);
  res.json({ ok: true });
});

router.post('/auth/password', authenticate, async (req, res, next) => {
  try {
    const body = z.object({ current: z.string().min(1, 'Enter your current password.'), newPassword }).parse(req.body);
    await auth.changePassword(req.user.id, body.current, body.newPassword, req.token);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
