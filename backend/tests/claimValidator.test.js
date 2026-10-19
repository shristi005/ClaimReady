const test = require('node:test');
const assert = require('node:assert');
const { validateClaim } = require('../src/services/claimValidator');

const f = (value, norm) => ({ value: String(value), quote: `quote ${value}`, norm: norm ?? value });
function packet(over = {}) {
  const base = {
    claim_form: { fields: { claimId: f('CL-1042'), patientRef: f('P-2231'), admissionDate: f('12/03/2026', '2026-03-12'), dischargeDate: f('15/03/2026', '2026-03-15'), claimedAmount: f('45,000', 45000) }, rejected: [] },
    hospital_bill: { fields: { claimId: f('CL-1042'), patientRef: f('P-2231'), admissionDate: f('12/03/2026', '2026-03-12'), dischargeDate: f('15/03/2026', '2026-03-15'), totalAmount: f('45,000', 45000), lineItems: [{ description: 'Room', amount: '30,000', norm: 30000 }, { description: 'Tests', amount: '15,000', norm: 15000 }] }, rejected: [] },
    discharge_summary: { fields: { patientRef: f('P-2231'), admissionDate: f('12/03/2026', '2026-03-12'), dischargeDate: f('15/03/2026', '2026-03-15') }, rejected: [] },
  };
  return { ...base, ...over };
}
const types = (issues) => issues.map((i) => i.issue_type);
const all = ['claim_form', 'hospital_bill', 'discharge_summary'];

test('a clean packet has no issues', () => {
  assert.deepStrictEqual(validateClaim({ documentTypes: all, extracted: packet() }), []);
});

test('flags claimed amount that differs from the bill total', () => {
  const p = packet();
  p.claim_form.fields.claimedAmount = f('54,000', 54000);
  const issues = validateClaim({ documentTypes: all, extracted: p });
  assert.deepStrictEqual(types(issues), ['AMOUNT_MISMATCH']);
  assert.strictEqual(issues[0].expected, 'Rs. 45,000');
  assert.strictEqual(issues[0].found, 'Rs. 54,000');
  assert.strictEqual(issues[0].evidence.length, 2);
});

test('flags a missing document as a blocker', () => {
  const p = packet(); delete p.discharge_summary;
  const issues = validateClaim({ documentTypes: ['claim_form', 'hospital_bill'], extracted: p });
  assert.deepStrictEqual(types(issues), ['MISSING_DOCUMENT']);
  assert.strictEqual(issues[0].severity, 'blocker');
});

test('flags line items that do not add up', () => {
  const p = packet();
  p.hospital_bill.fields.lineItems[1] = { description: 'Tests', amount: '12,000', norm: 12000 };
  assert.deepStrictEqual(types(validateClaim({ documentTypes: all, extracted: p })), ['SUM_MISMATCH']);
});

test('flags discharge before admission and mismatching dates', () => {
  const p = packet();
  p.hospital_bill.fields.dischargeDate = f('10/03/2026', '2026-03-10');
  const t = types(validateClaim({ documentTypes: all, extracted: p }));
  assert.ok(t.includes('DATE_ORDER') && t.includes('DATE_MISMATCH'));
});

test('flags different claim IDs and patient IDs as blockers', () => {
  const p = packet();
  p.hospital_bill.fields.claimId = f('CL-1043');
  p.discharge_summary.fields.patientRef = f('P-9999');
  const issues = validateClaim({ documentTypes: all, extracted: p });
  assert.deepStrictEqual(types(issues).sort(), ['ID_MISMATCH', 'PATIENT_MISMATCH']);
  assert.ok(issues.every((i) => i.severity === 'blocker'));
});

test('unreadable required fields become info items, not guesses', () => {
  const p = packet();
  p.claim_form.fields.claimedAmount = null;
  p.claim_form.llmError = 'Cannot reach Ollama. Start it and check OLLAMA_URL.';
  const issues = validateClaim({ documentTypes: all, extracted: p });
  assert.deepStrictEqual(types(issues).sort(), ['AI_UNAVAILABLE', 'LOW_CONFIDENCE']);
  assert.ok(issues.every((i) => i.severity === 'info'));
});

test('severity order is blocker, review, info', () => {
  const p = packet(); delete p.discharge_summary;
  p.claim_form.fields.claimedAmount = f('54,000', 54000);
  p.claim_form.fields.patientRef = null;
  const order = validateClaim({ documentTypes: ['claim_form', 'hospital_bill'], extracted: p }).map((i) => i.severity);
  assert.deepStrictEqual(order, [...order].sort((a, b) => ({ blocker: 0, review: 1, info: 2 }[a] - { blocker: 0, review: 1, info: 2 }[b])));
});
