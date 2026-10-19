process.env.DB_PATH = ':memory:';
process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'cr-test-'));

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const auth = require('../src/services/authService');
const repo = require('../src/services/claimsRepository');
const { getDb } = require('../src/db');

const db = getDb();
const rejects = (p, status) => assert.rejects(p, (e) => (status ? e.status === status : true));

test('register then login, and sessions resolve to the user', async () => {
  const { token } = await auth.register('Nurse@Example.com', 'a-long-password-1');
  assert.strictEqual(auth.getSession(token).user.email, 'nurse@example.com');
  const again = await auth.login('nurse@example.com', 'a-long-password-1');
  assert.ok(auth.getSession(again.token));
});

test('duplicate email and wrong password are rejected', async () => {
  await rejects(auth.register('nurse@example.com', 'a-long-password-1'), 409);
  await rejects(auth.login('nurse@example.com', 'wrong-password-123'), 401);
  await rejects(auth.login('nobody@example.com', 'wrong-password-123'), 401);
});

test('account locks after 5 wrong passwords, even for the right one', async () => {
  await auth.register('lock@example.com', 'a-long-password-2');
  for (let i = 0; i < 5; i++) await rejects(auth.login('lock@example.com', 'bad-password-xx'), 401);
  await rejects(auth.login('lock@example.com', 'a-long-password-2'), 429);
});

test('sessions expire when idle and after logout', async () => {
  await auth.register('idle@example.com', 'a-long-password-3');
  const { token } = await auth.login('idle@example.com', 'a-long-password-3');
  db.prepare('UPDATE sessions SET expires_at = ?').run(new Date(Date.now() - 1000).toISOString());
  assert.strictEqual(auth.getSession(token), null);
  const { token: t2 } = await auth.login('idle@example.com', 'a-long-password-3');
  auth.destroySession(t2);
  assert.strictEqual(auth.getSession(t2), null);
});

test('changing a password works, needs the old one, and signs out other devices', async () => {
  await auth.register('pw@example.com', 'a-long-password-4');
  const a = await auth.login('pw@example.com', 'a-long-password-4');
  const b = await auth.login('pw@example.com', 'a-long-password-4');
  const userId = auth.getSession(a.token).user.id;
  await rejects(auth.changePassword(userId, 'not-the-password', 'a-new-long-pass-5', a.token), 400);
  await auth.changePassword(userId, 'a-long-password-4', 'a-new-long-pass-5', a.token);
  assert.ok(auth.getSession(a.token));
  assert.strictEqual(auth.getSession(b.token), null);
  await rejects(auth.login('pw@example.com', 'a-long-password-4'), 401);
  assert.ok(await auth.login('pw@example.com', 'a-new-long-pass-5'));
});

test('stored password is hashed with a unique salt, token is stored only as a hash', async () => {
  const h1 = await auth.hashPassword('same-password-123');
  const h2 = await auth.hashPassword('same-password-123');
  assert.notStrictEqual(h1.hash, h2.hash);
  assert.ok(await auth.verifyPassword('same-password-123', h1.hash, h1.salt));
  assert.ok(!(await auth.verifyPassword('other-password-123', h1.hash, h1.salt)));
  const { token } = await auth.register('hash@example.com', 'a-long-password-6');
  const stored = db.prepare('SELECT token_hash FROM sessions').all().map((r) => r.token_hash);
  assert.ok(!stored.includes(token));
  assert.ok(stored.includes(crypto.createHash('sha256').update(token).digest('hex')));
});

test('one organization can never read another organization\'s claims', async () => {
  const mkOrg = (name) => { const id = crypto.randomUUID(); db.prepare('INSERT INTO organizations (id, name) VALUES (?,?)').run(id, name); return id; };
  const orgA = mkOrg('Hospital A');
  const orgB = mkOrg('Hospital B');
  const claim = await repo.createClaim({ orgId: orgA, userId: 'u1', claimReference: 'A-1', insurerName: 'X' });
  await repo.saveResults(claim.id, orgA, {
    documents: [], extracted: {}, modelUsed: 'test',
    issues: [{ issue_type: 'AMOUNT_MISMATCH', severity: 'review', field: 'claimedAmount', message: 'm', action: 'a', grounded: true, evidence: [{ document: 'claim_form', quote: 'q' }], source_documents: ['claim_form'] }],
  });
  const own = await repo.getClaim(orgA, claim.id);
  assert.strictEqual(own.issues.length, 1);
  assert.deepStrictEqual(own.issues[0].evidence, [{ document: 'claim_form', quote: 'q' }]);
  assert.strictEqual(await repo.getClaim(orgB, claim.id), null);
  assert.strictEqual(await repo.getClaimStatus(orgB, claim.id), null);
  assert.deepStrictEqual(await repo.listClaims(orgB), []);
  assert.strictEqual(await repo.getIssue(orgB, own.issues[0].id), null);
  assert.strictEqual(await repo.getDocumentFile(orgB, 'anything'), null);
  await assert.rejects(repo.updateIssue({ orgId: orgB, userId: 'u2', issueId: own.issues[0].id, reviewStatus: 'resolved' }));
  assert.strictEqual((await repo.getIssue(orgA, own.issues[0].id)).review_status, 'open');
  const r = await repo.updateIssue({ orgId: orgA, userId: 'u1', issueId: own.issues[0].id, reviewStatus: 'resolved' });
  assert.strictEqual(r.claimStatus, 'ready');
});
