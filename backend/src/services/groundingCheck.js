// Quote grounding: an AI-extracted field is only kept if the quote it cites really appears in the
// document AND the value is really in that quote. For dates and amounts, a model may reformat the value
// (12/03/2026 -> 2026-03-12, "Rs. 45,000" -> 45000). That is accepted only if the quote itself contains
// the same date or amount, and we keep the text exactly as the document wrote it.
const { normalizeAmount, normalizeDate } = require('../utils/normalize');

const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
// For ids, ignore currency words, commas and spaces: "54000" matches "Rs. 54,000".
const loose = (s) => squash(s).replace(/rs\.?|inr|₹|[,\s]/g, '');

const DATE_TOKEN = /\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?[ \-][A-Za-z]{3,9}\.?,?[ \-]\d{4}|[A-Za-z]{3,9}\.? \d{1,2},? \d{4}/g;
const AMOUNT_TOKEN = /\d[\d,]*(?:\.\d{1,2})?/g;

function quoteInText(field, sourceText) {
  if (!field || !field.quote || !field.value) return false;
  const quote = squash(field.quote);
  return quote.length >= 2 && squash(sourceText).includes(quote);
}

// Returns the field with value replaced by the document's own text, or null if it cannot be confirmed.
function groundField(field, sourceText, kind = 'id') {
  if (!quoteInText(field, sourceText)) return null;
  const quote = String(field.quote);
  if (kind === 'date') {
    const want = normalizeDate(field.value);
    if (!want) return null;
    const hit = (quote.match(DATE_TOKEN) || []).find((t) => normalizeDate(t) === want);
    return hit ? { ...field, value: hit.trim() } : null;
  }
  if (kind === 'amount') {
    const want = normalizeAmount(field.value);
    if (want === null) return null;
    const hit = (quote.match(AMOUNT_TOKEN) || []).find((t) => normalizeAmount(t) === want);
    return hit ? { ...field, value: hit.trim() } : null;
  }
  const v = loose(field.value);
  return v && loose(quote).includes(v) ? field : null;
}

// Backwards-compatible yes/no form.
const isGrounded = (field, sourceText, kind = 'id') => groundField(field, sourceText, kind) !== null;

module.exports = { isGrounded, groundField };
