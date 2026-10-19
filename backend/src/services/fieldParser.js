// Hybrid extraction: regex first, then the model fills ONLY what regex missed.
// Every model answer must carry a quote; answers whose quote is not in the document are rejected.
const llm = require('../llm/llmClient');
const { regexExtract } = require('./regexExtractor');
const { groundField } = require('./groundingCheck');
const { normalizeAmount, normalizeDate, normalizeId } = require('../utils/normalize');
const { REQUIRED_FIELDS, FIELD_KINDS } = require('../rules/requiredDocuments');

const MAX_CHARS = 6000; // keeps the prompt inside a 4096-token context

const FIELD_HELP = {
  claimId: 'the claim ID / claim number / case number',
  patientRef: 'the patient ID / UHID / patient reference',
  admissionDate: 'the date of admission (check-in date)',
  dischargeDate: 'the date of discharge (check-out date)',
  totalAmount: 'the total bill amount (final amount payable)',
  claimedAmount: 'the amount being claimed from the insurer',
};

const SYSTEM =
  'You extract fields from hospital insurance documents. Copy each value exactly as it is written in the document: ' +
  'do not reformat dates or amounts. For every field also return a quote: the whole line from the document that contains the value, ' +
  'copied character for character. If a field is not present, return empty strings. Never guess. Never calculate. Output JSON only.';

const EXAMPLE =
  'Example. Document line: "Admitted on: 05/01/2026" -> {"value":"05/01/2026","quote":"Admitted on: 05/01/2026"}. ' +
  'Document line: "Ref no. AB-77" -> {"value":"AB-77","quote":"Ref no. AB-77"}.';

const fieldSchema = {
  type: 'object',
  properties: { value: { type: 'string' }, quote: { type: 'string' } },
  required: ['value', 'quote'],
};

function buildSchema(keys, wantItems) {
  const properties = {};
  const required = [];
  for (const k of keys) { properties[k] = fieldSchema; required.push(k); }
  if (wantItems) {
    properties.lineItems = {
      type: 'array',
      items: {
        type: 'object',
        properties: { description: { type: 'string' }, amount: { type: 'string' }, quote: { type: 'string' } },
        required: ['description', 'amount', 'quote'],
      },
    };
    required.push('lineItems');
  }
  return { type: 'object', properties, required };
}

async function askModel(docType, text, keys, wantItems) {
  const lines = keys.map((k) => `- ${k}: ${FIELD_HELP[k]}`);
  if (wantItems) lines.push('- lineItems: every charge line with its description and amount');
  const prompt =
    `Document type: ${docType}\nExtract these fields:\n${lines.join('\n')}\n` +
    `If a field is not in the document, return empty strings for its value and quote.\n${EXAMPLE}\n\n` +
    `Document text:\n"""\n${text.slice(0, MAX_CHARS)}\n"""\nReturn JSON only.`;
  const schema = buildSchema(keys, wantItems);
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await llm.complete({ system: SYSTEM, prompt, schema });
    } catch (e) {
      lastErr = e;
      if (!/invalid json/i.test(e.message)) break; // only retry bad JSON, not outages
    }
  }
  throw lastErr;
}

function normalizeByKind(kind, value) {
  if (kind === 'amount') return normalizeAmount(value);
  if (kind === 'date') return normalizeDate(value);
  return normalizeId(value);
}

async function parseFields(docType, text) {
  const fields = regexExtract(text);
  const rejected = [];
  let llmUsed = false;
  let llmError = null;

  const missing = (REQUIRED_FIELDS[docType] || []).filter((k) => !fields[k]);
  const wantItems = docType === 'hospital_bill' && fields.lineItems.length === 0;

  if (missing.length || wantItems) {
    try {
      const out = await askModel(docType, text, missing, wantItems);
      llmUsed = true;
      for (const k of missing) {
        const f = out?.[k];
        if (!f || !f.value || !f.quote) continue; // model said "not found"
        const cand = { value: String(f.value).trim(), quote: String(f.quote).trim(), source: 'llm' };
        const ok = groundField(cand, text, FIELD_KINDS[k]);
        if (ok) fields[k] = ok;
        else rejected.push({ field: k, value: cand.value, quote: cand.quote, reason: 'AI answer rejected: its quote was not found in the document' });
      }
      if (wantItems && Array.isArray(out?.lineItems)) {
        for (const it of out.lineItems) {
          if (!it?.amount || !it?.quote) continue;
          const cand = { description: String(it.description || '').trim(), amount: String(it.amount).trim(), quote: String(it.quote).trim(), source: 'llm' };
          const ok = groundField({ value: cand.amount, quote: cand.quote }, text, 'amount');
          if (ok) fields.lineItems.push({ ...cand, amount: ok.value });
          else rejected.push({ field: 'lineItems', value: cand.description, quote: cand.quote, reason: 'AI answer rejected: its quote was not found in the document' });
        }
      }
    } catch (e) {
      llmError = e.message;
    }
  }

  for (const [key, kind] of Object.entries(FIELD_KINDS)) {
    if (!fields[key]) continue;
    fields[key].norm = normalizeByKind(kind, fields[key].value);
    if (fields[key].norm === null || fields[key].norm === undefined) {
      rejected.push({ field: key, value: fields[key].value, reason: 'Value could not be understood' });
      fields[key] = null;
    }
  }
  fields.lineItems = fields.lineItems
    .map((it) => ({ ...it, norm: normalizeAmount(it.amount) }))
    .filter((it) => it.norm !== null);

  return { fields, rejected, llmUsed, llmError };
}

module.exports = { parseFields };
