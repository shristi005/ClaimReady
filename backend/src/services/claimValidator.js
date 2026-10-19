// Deterministic rules. No AI here: plain comparisons with evidence.
const { REQUIRED_DOCUMENTS, DOC_LABELS, REQUIRED_FIELDS, FIELD_LABELS } = require('../rules/requiredDocuments');
const { formatInr } = require('../utils/normalize');

const TOL = 0.01;
const RANK = { blocker: 0, review: 1, info: 2 };

const get = (extracted, docType, key) => extracted[docType]?.fields?.[key] || null;
const ev = (document, field, f) => ({ document, field, value: f?.value ?? '', quote: f?.quote ?? '' });
const issue = (o) => ({ grounded: true, evidence: [], source_documents: [], ...o });

function validateClaim({ documentTypes, extracted }) {
  const issues = [];
  const present = REQUIRED_DOCUMENTS.filter((t) => documentTypes.includes(t) && extracted[t]);

  // R1: required documents
  for (const t of REQUIRED_DOCUMENTS) {
    if (!documentTypes.includes(t)) {
      issues.push(issue({
        issue_type: 'MISSING_DOCUMENT', severity: 'blocker', field: t,
        expected: 'Document uploaded', found: 'Not uploaded', source_documents: [t],
        message: `${DOC_LABELS[t]} is missing from this claim packet.`,
        action: `Add the ${DOC_LABELS[t].toLowerCase()} before submission.`,
      }));
    }
  }

  // R2, R6, R7: same value across documents
  const across = (key, issue_type, severity, label) => {
    const items = present.map((t) => ({ t, f: get(extracted, t, key) })).filter((x) => x.f);
    if (items.length > 1 && new Set(items.map((x) => x.f.norm)).size > 1) {
      issues.push(issue({
        issue_type, severity, field: key,
        expected: 'Same value in every document',
        found: items.map((x) => `${DOC_LABELS[x.t]}: ${x.f.value}`).join(' | '),
        source_documents: items.map((x) => x.t),
        evidence: items.map((x) => ev(x.t, key, x.f)),
        message: `The ${label} is not the same in all documents.`,
        action: 'Check each document and confirm the correct value.',
      }));
    }
  };
  across('claimId', 'ID_MISMATCH', 'blocker', 'claim ID');
  across('patientRef', 'PATIENT_MISMATCH', 'blocker', 'patient ID');
  across('admissionDate', 'DATE_MISMATCH', 'review', 'admission date');
  across('dischargeDate', 'DATE_MISMATCH', 'review', 'discharge date');

  // R3: claimed amount vs bill total
  const claimed = get(extracted, 'claim_form', 'claimedAmount');
  const total = get(extracted, 'hospital_bill', 'totalAmount');
  if (claimed && total && Math.abs(claimed.norm - total.norm) > TOL) {
    issues.push(issue({
      issue_type: 'AMOUNT_MISMATCH', severity: 'review', field: 'claimedAmount',
      expected: formatInr(total.norm), found: formatInr(claimed.norm),
      source_documents: ['claim_form', 'hospital_bill'],
      evidence: [ev('claim_form', 'claimedAmount', claimed), ev('hospital_bill', 'totalAmount', total)],
      message: `The claimed amount (${formatInr(claimed.norm)}) differs from the hospital bill total (${formatInr(total.norm)}).`,
      action: 'Check both documents and confirm the correct amount. A difference can have a valid reason, such as an adjustment.',
    }));
  }

  // R4: line items add up to the bill total
  const items = extracted.hospital_bill?.fields?.lineItems || [];
  if (items.length && total) {
    const sum = Math.round(items.reduce((s, i) => s + i.norm, 0) * 100) / 100;
    if (Math.abs(sum - total.norm) > TOL) {
      issues.push(issue({
        issue_type: 'SUM_MISMATCH', severity: 'review', field: 'totalAmount',
        expected: formatInr(sum), found: formatInr(total.norm),
        source_documents: ['hospital_bill'],
        evidence: [
          ev('hospital_bill', 'totalAmount', total),
          { document: 'hospital_bill', field: 'lineItems', value: formatInr(sum), quote: `${items.length} line items add up to ${formatInr(sum)}` },
        ],
        message: `The bill's line items add up to ${formatInr(sum)}, but the bill total is ${formatInr(total.norm)}.`,
        action: 'Check the line items and the total on the bill. Discounts or advances may explain the difference.',
      }));
    }
  }

  // R5: admission must not be after discharge
  for (const t of present) {
    const a = get(extracted, t, 'admissionDate');
    const d = get(extracted, t, 'dischargeDate');
    if (a && d && a.norm > d.norm) {
      issues.push(issue({
        issue_type: 'DATE_ORDER', severity: 'review', field: 'dischargeDate',
        expected: `On or after ${a.value}`, found: d.value, source_documents: [t],
        evidence: [ev(t, 'admissionDate', a), ev(t, 'dischargeDate', d)],
        message: `In the ${DOC_LABELS[t].toLowerCase()}, the discharge date is before the admission date.`,
        action: 'Check both dates in the document.',
      }));
    }
  }

  // R8: fields we could not read or trust (info, needs a human look)
  let aiDown = null;
  for (const t of present) {
    const rejected = extracted[t].rejected || [];
    if (extracted[t].llmError) aiDown = extracted[t].llmError;
    for (const key of REQUIRED_FIELDS[t]) {
      if (get(extracted, t, key)) continue;
      const rej = rejected.find((r) => r.field === key);
      issues.push(issue({
        issue_type: 'LOW_CONFIDENCE', severity: 'info', field: key, grounded: false,
        expected: `A readable ${FIELD_LABELS[key]}`, found: rej ? rej.reason : 'Not found',
        source_documents: [t],
        message: `Could not read the ${FIELD_LABELS[key]} from the ${DOC_LABELS[t].toLowerCase()}, so it was not checked.`,
        action: 'Check this field manually in the document.',
      }));
    }
  }
  if (aiDown) {
    issues.push(issue({
      issue_type: 'AI_UNAVAILABLE', severity: 'info', field: 'ai', grounded: false,
      expected: 'Local AI available', found: aiDown,
      message: 'The AI model was not available, so only clearly labelled fields were read.',
      action: 'Start Ollama and re-run if you want the AI to read the unlabelled fields.',
    }));
  }

  return issues.sort((x, y) => RANK[x.severity] - RANK[y.severity]);
}

const statusFromIssues = (issues) =>
  issues.some((i) => i.severity !== 'info' && (i.review_status ?? 'open') === 'open') ? 'needs_review' : 'ready';

module.exports = { validateClaim, statusFromIssues };
