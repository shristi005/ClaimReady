// End-to-end check against a RUNNING server: accounts, workspaces, roles, upload, analysis, review, isolation.
// Usage: start the backend, run `npm run samples` once, then `npm run smoke`.
// It creates throwaway accounts (smoke-*@example.com) in your database; use a scratch DATA_DIR if you care.
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:4000';
const SAMPLE = path.join(__dirname, '..', 'eval', 'testClaims', '02-amount-mismatch');
const run = Date.now();
const PW = 'smoke-test-password-1';
let failed = 0;

const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); if (!ok) failed++; };
const call = async (method, url, token, body, form) => {
  const res = await fetch(BASE + '/api' + url, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
};
const signUp = async (tag) => (await call('POST', '/auth/register', null, { email: `smoke-${tag}-${run}@example.com`, password: PW })).body.token;

(async () => {
  if (!fs.existsSync(SAMPLE)) { console.error('Run `npm run samples` first.'); process.exit(1); }

  check('health is public', (await call('GET', '/health')).status === 200);
  check('protected route needs sign-in', (await call('GET', '/claims')).status === 401);
  check('short password rejected', (await call('POST', '/auth/register', null, { email: `x-${run}@example.com`, password: 'short' })).status === 400);

  const admin = await signUp('admin');
  check('register returns a session token', !!admin);
  check('no workspace yet -> 403 on claims', (await call('GET', '/claims', admin)).status === 403);
  check('create workspace', (await call('POST', '/org/bootstrap', admin, { mode: 'create', orgName: 'Smoke Hospital', fullName: 'Admin Person' })).status === 201);
  const me = (await call('GET', '/me', admin)).body;
  check('admin role assigned', me.membership?.role === 'admin' && me.membership.org_name === 'Smoke Hospital');

  // Upload a fictional packet with an amount mismatch
  const form = new FormData();
  form.append('claim_reference', 'SMOKE-1');
  form.append('insurer_name', 'Test Insurer');
  for (const t of ['claim_form', 'hospital_bill', 'discharge_summary']) {
    form.append(t, new Blob([fs.readFileSync(path.join(SAMPLE, `${t}.pdf`))], { type: 'application/pdf' }), `${t}.pdf`);
  }
  const up = await call('POST', '/claims/analyze', admin, null, form);
  check('upload accepted (202)', up.status === 202 && up.body.claimId, JSON.stringify(up.body));
  const id = up.body.claimId;

  let st;
  for (let i = 0; i < 60; i++) { st = (await call('GET', `/claims/${id}/status`, admin)).body; if (st.status !== 'processing') break; await new Promise((r) => setTimeout(r, 500)); }
  check('analysis finished', st.status === 'needs_review', JSON.stringify(st));

  const claim = (await call('GET', `/claims/${id}`, admin)).body;
  const amount = claim.issues.find((i) => i.issue_type === 'AMOUNT_MISMATCH');
  check('amount mismatch found with evidence', !!amount && amount.evidence.length === 2 && amount.expected === 'Rs. 45,000' && amount.found === 'Rs. 54,000');
  check('checklist shows 3 documents', claim.checklist.length === 3 && claim.checklist.every((c) => c.present));

  const doc = await call('GET', `/documents/${claim.documents[0].id}/file`, admin);
  check('original document can be viewed', doc.status === 200 && doc.body.slice(0, 4).toString() === '%PDF');

  const fixed = await call('PATCH', `/issues/${amount.id}`, admin, { review_status: 'resolved' });
  check('resolving the last issue makes the claim ready', fixed.status === 200 && fixed.body.claimStatus === 'ready', JSON.stringify(fixed.body));
  check('bad review status rejected', (await call('PATCH', `/issues/${amount.id}`, admin, { review_status: 'banana' })).status === 400);
  const stats = (await call('GET', '/claims/stats', admin)).body;
  check('dashboard stats', stats.claimsChecked === 1 && stats.resolvedIssues === 1 && stats.openIssues === 0, JSON.stringify(stats));

  // Roles: invite a viewer
  const viewer = await signUp('viewer');
  check('invite requires matching email', (await call('POST', '/org/bootstrap', viewer, { mode: 'join', fullName: 'Vera Viewer', code: 'doesnotexist' })).status === 400);
  const inv = (await call('POST', '/org/invites', admin, { email: `smoke-viewer-${run}@example.com`, role: 'viewer' })).body;
  const stranger = await signUp('stranger');
  check('invite code is useless to a different email', (await call('POST', '/org/bootstrap', stranger, { mode: 'join', fullName: 'Sam Stranger', code: inv.code })).status === 400);
  check('viewer joins with invite', (await call('POST', '/org/bootstrap', viewer, { mode: 'join', fullName: 'Vera Viewer', code: inv.code })).status === 201);
  check('invite cannot be reused', (await call('POST', '/org/bootstrap', await signUp('late'), { mode: 'join', fullName: 'Late Joiner', code: inv.code })).status === 400);
  check('viewer can read claims', (await call('GET', '/claims', viewer)).body.length === 1);
  check('viewer cannot change issues', (await call('PATCH', `/issues/${amount.id}`, viewer, { review_status: 'open' })).status === 403);
  check('viewer cannot upload', (await call('POST', '/claims/analyze', viewer, null, form)).status === 403);
  check('viewer cannot manage the team', (await call('GET', '/org/members', viewer)).status === 403);

  // Isolation: another hospital cannot see this one's data
  check('stranger creates their own workspace', (await call('POST', '/org/bootstrap', stranger, { mode: 'create', orgName: 'Other Hospital', fullName: 'Sam Stranger' })).status === 201);
  check('other hospital sees no claims', (await call('GET', '/claims', stranger)).body.length === 0);
  check('other hospital cannot open the claim', (await call('GET', `/claims/${id}`, stranger)).status === 404);
  check('other hospital cannot open the file', (await call('GET', `/documents/${claim.documents[0].id}/file`, stranger)).status === 404);
  check('other hospital cannot change the issue', (await call('PATCH', `/issues/${amount.id}`, stranger, { review_status: 'open' })).status === 404);

  // Admin tools and sessions
  const members = (await call('GET', '/org/members', admin)).body;
  const vm = members.find((m) => m.email.includes('viewer'));
  check('admin sees both members', members.length === 2 && !!vm);
  check('admin promotes viewer to reviewer', (await call('PATCH', `/org/members/${vm.user_id}`, admin, { role: 'reviewer' })).status === 200);
  check('reviewer can now change issues', (await call('PATCH', `/issues/${amount.id}`, viewer, { review_status: 'open' })).status === 200);
  check('admin resets a password, old sessions end', (await call('POST', `/org/members/${vm.user_id}/password`, admin, { newPassword: 'temporary-password-9' })).status === 200 && (await call('GET', '/me', viewer)).status === 401);
  const relog = await call('POST', '/auth/login', null, { email: `smoke-viewer-${run}@example.com`, password: 'temporary-password-9' });
  check('user signs in with the temporary password', relog.status === 200);
  check('wrong password gives a clear error', (await call('POST', '/auth/login', null, { email: `smoke-viewer-${run}@example.com`, password: 'nope-nope-nope' })).status === 401);
  check('admin removes a member and their session ends immediately', (await call('DELETE', `/org/members/${vm.user_id}`, admin)).status === 200 && (await call('GET', '/claims', relog.body.token)).status === 401);
  const again = await call('POST', '/auth/login', null, { email: `smoke-viewer-${run}@example.com`, password: 'temporary-password-9' });
  check('a removed member can sign in but sees no hospital data', again.status === 200 && (await call('GET', '/claims', again.body.token)).status === 403);
  check('logout ends the session', (await call('POST', '/auth/logout', admin)).status === 200 && (await call('GET', '/me', admin)).status === 401);

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
