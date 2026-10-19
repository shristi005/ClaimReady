const test = require('node:test');
const assert = require('node:assert');
const { isGrounded } = require('../src/services/groundingCheck');
const { normalizeAmount, normalizeDate } = require('../src/utils/normalize');

const text = 'HOSPITAL BILL\nClaim ID: CL-1042\nTotal Amount: Rs. 45,000\nDate of Admission: 12/03/2026';

test('accepts a quote that exists and contains the value', () => {
  assert.ok(isGrounded({ value: 'CL-1042', quote: 'Claim ID: CL-1042' }, text));
});
test('accepts an amount written without commas or currency', () => {
  assert.ok(isGrounded({ value: '45000', quote: 'Total Amount: Rs. 45,000' }, text));
});
test('rejects a quote that is not in the document', () => {
  assert.ok(!isGrounded({ value: '54000', quote: 'Claimed Amount: Rs. 54,000' }, text));
});
test('rejects a value that is not inside its own quote', () => {
  assert.ok(!isGrounded({ value: '99999', quote: 'Total Amount: Rs. 45,000' }, text));
});
test('rejects empty answers', () => {
  assert.ok(!isGrounded({ value: '', quote: '' }, text));
  assert.ok(!isGrounded(null, text));
});
test('normalizes amounts and day-first dates', () => {
  assert.strictEqual(normalizeAmount('Rs. 54,000.50'), 54000.5);
  assert.strictEqual(normalizeDate('12/03/2026'), '2026-03-12');
  assert.strictEqual(normalizeDate('31/02/2026'), null);
});
