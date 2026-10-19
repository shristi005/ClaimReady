const router = require('express').Router();
const { z } = require('zod');
const crypto = require('crypto');
const { getDb } = require('../db');
const { authenticate, requireOrg, requireRole } = require('../middleware/auth');
const guard = [authenticate, requireOrg];
const statuses = ['open', 'waiting_documents', 'ready_review', 'responded'];
const createSchema = z.object({ claim_id: z.string().uuid(), query_text: z.string().trim().min(5).max(4000), deadline: z.string().min(10) });
const patchSchema = z.object({ status: z.enum(statuses).optional(), response_draft: z.string().max(10000).optional() }).refine((v) => Object.keys(v).length > 0);

router.get('/queries', ...guard, (req, res) => {
  const rows = getDb().prepare(`SELECT q.*, c.claim_reference, c.patient_reference, c.insurer_name FROM insurer_queries q JOIN claims c ON c.id=q.claim_id WHERE q.org_id=? ORDER BY CASE WHEN q.status='responded' THEN 1 ELSE 0 END, q.deadline ASC, q.created_at DESC`).all(req.orgId);
  res.json(rows);
});
router.post('/queries', ...guard, requireRole('admin','reviewer'), (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const db = getDb();
    const claim = db.prepare('SELECT id FROM claims WHERE id=? AND org_id=?').get(input.claim_id, req.orgId);
    if (!claim) return res.status(404).json({ error: 'Claim not found.' });
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO insurer_queries (id,org_id,claim_id,query_text,deadline,created_by) VALUES (?,?,?,?,?,?)').run(id, req.orgId, input.claim_id, input.query_text, input.deadline, req.user.id);
    res.status(201).json(db.prepare('SELECT q.*, c.claim_reference, c.patient_reference, c.insurer_name FROM insurer_queries q JOIN claims c ON c.id=q.claim_id WHERE q.id=?').get(id));
  } catch (e) { next(e); }
});
router.patch('/queries/:id', ...guard, requireRole('admin','reviewer'), (req, res, next) => {
  try {
    const input = patchSchema.parse(req.body);
    const db = getDb();
    const current = db.prepare('SELECT * FROM insurer_queries WHERE id=? AND org_id=?').get(req.params.id, req.orgId);
    if (!current) return res.status(404).json({ error: 'Query not found.' });
    db.prepare('UPDATE insurer_queries SET status=?, response_draft=?, updated_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id=? AND org_id=?').run(input.status ?? current.status, input.response_draft ?? current.response_draft, req.params.id, req.orgId);
    res.json(db.prepare('SELECT q.*, c.claim_reference, c.patient_reference, c.insurer_name FROM insurer_queries q JOIN claims c ON c.id=q.claim_id WHERE q.id=?').get(req.params.id));
  } catch (e) { next(e); }
});
router.post('/queries/:id/draft', ...guard, requireRole('admin','reviewer'), (req, res) => {
  const db = getDb();
  const query = db.prepare('SELECT * FROM insurer_queries WHERE id=? AND org_id=?').get(req.params.id, req.orgId);
  if (!query) return res.status(404).json({ error: 'Query not found.' });
  const docs = db.prepare('SELECT id,doc_type,original_name,extracted_json FROM documents WHERE claim_id=? AND org_id=?').all(query.claim_id, req.orgId);
  const issues = db.prepare('SELECT message,expected,found,evidence,source_documents FROM claim_issues WHERE claim_id=? AND org_id=?').all(query.claim_id, req.orgId);
  const terms = query.query_text.toLowerCase().split(/\W+/).filter((x) => x.length > 3).map((x) => x.endsWith('s') ? x.slice(0, -1) : x);
  const labels = { claimId: 'Claim reference', patientRef: 'Patient ID', admissionDate: 'Admission date', dischargeDate: 'Discharge date', totalAmount: 'Hospital bill total', claimedAmount: 'Amount claimed', lineItems: 'Bill item' };
  const evidence = [];
  for (const doc of docs) {
    let extracted = {}; try { extracted = JSON.parse(doc.extracted_json || '{}'); } catch {}
    for (const [key, value] of Object.entries(extracted.fields || {})) {
      // Extractors represent fields they did not find as null. Skip those safely.
      const val = value && typeof value === 'object' ? (value.value ?? value.norm ?? '') : value;
      const text = String(val || '');
      const label = labels[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
      if (text && terms.some((t) => `${label} ${key} ${text}`.toLowerCase().includes(t))) evidence.push({ source: doc.original_name || doc.doc_type, field: label, value: text });
    }
  }
  for (const issue of issues) {
    if (terms.some((t) => (issue.message || '').toLowerCase().includes(t))) {
      evidence.push({ source: `Claim review: ${issue.message}`, field: 'Review evidence', value: `Expected: ${issue.expected || '—'}; found: ${issue.found || '—'}` });
    }
  }
  const selected = evidence.slice(0, 8);
  const missingDischarge = issues.some((issue) => /discharge summary is missing/i.test(issue.message || ''));
  const response = `Dear Claims Team,\n\nRegarding your query: “${query.query_text}”\n\n${selected.length ? 'We checked the documents currently uploaded for this claim and found:' : 'We could not find matching details in the documents currently uploaded for this claim.'}\n\n${selected.map((e, i) => `[${i + 1}] ${e.field}: ${e.value} (Source: ${e.source})`).join('\n')}${missingDischarge ? `\n\nThe discharge summary is not among the uploaded documents. The dates above should be checked against that summary once it is available.` : ''}\n\nPlease review these details and the cited documents before sending a response.\n\nKind regards,\nClaims Team`;
  res.json({ response_draft: response, evidence: selected });
});
module.exports = router;
