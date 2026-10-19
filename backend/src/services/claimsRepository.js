// All data access lives here, backed by SQLite. Every function takes orgId: no cross-organization reads.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb } = require('../db');
const env = require('../config/env');
const { statusFromIssues } = require('./claimValidator');
const { safeName } = require('../utils/fileValidation');

const db = () => getDb();
const nowIso = () => new Date().toISOString();
const toJson = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
const fromJson = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };
const issueRow = (r) => r && { ...r, grounded: !!r.grounded, evidence: fromJson(r.evidence, []), source_documents: fromJson(r.source_documents, []) };

async function audit({ orgId, userId, claimId = null, action, detail = null }) {
  try {
    db().prepare('INSERT INTO audit_log (id, org_id, user_id, claim_id, action, detail) VALUES (?,?,?,?,?,?)')
      .run(crypto.randomUUID(), orgId, userId, claimId, action, toJson(detail));
  } catch (e) {
    console.error('audit failed:', e.message);
  }
}

async function createClaim({ orgId, userId, claimReference, insurerName }) {
  const id = crypto.randomUUID();
  db().prepare('INSERT INTO claims (id, org_id, created_by, claim_reference, insurer_name) VALUES (?,?,?,?,?)')
    .run(id, orgId, userId, claimReference, insurerName || null);
  return db().prepare('SELECT * FROM claims WHERE id = ?').get(id);
}

async function storeDocument({ orgId, claimId, docType, file, storageName = safeName(file.originalname) }) {
  const rel = path.join(orgId, claimId, `${docType}-${safeName(storageName)}`);
  const abs = path.join(env.uploadsDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, file.buffer, { flag: 'wx' });
  db().prepare('INSERT INTO documents (id, org_id, claim_id, doc_type, storage_path, original_name, mime_type) VALUES (?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(), orgId, claimId, docType, rel, String(file.originalname || '').slice(0, 200), file.mimetype);
}

async function setStage(claimId, stage, progress) {
  db().prepare('UPDATE claims SET stage = ?, progress = ? WHERE id = ?').run(stage, progress, claimId);
}

async function saveResults(claimId, orgId, result) {
  const patient =
    result.extracted.claim_form?.fields?.patientRef?.norm ||
    result.extracted.hospital_bill?.fields?.patientRef?.norm || null;
  db().transaction(() => {
    for (const d of result.documents) {
      const ex = result.extracted[d.docType];
      db().prepare('UPDATE documents SET extraction_method = ?, extraction_confidence = ?, extracted_json = ? WHERE claim_id = ? AND doc_type = ?')
        .run(d.method, d.confidence, toJson({ fields: ex.fields, rejected: ex.rejected, llmUsed: ex.llmUsed, llmError: ex.llmError }), claimId, d.docType);
    }
    const ins = db().prepare(
      `INSERT INTO claim_issues (id, org_id, claim_id, issue_type, severity, field, expected, found, message, action, source_documents, evidence, grounded)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    for (const i of result.issues) {
      ins.run(crypto.randomUUID(), orgId, claimId, i.issue_type, i.severity, i.field ?? null, i.expected ?? null, i.found ?? null,
        i.message ?? null, i.action ?? null, toJson(i.source_documents || []), toJson(i.evidence || []), i.grounded ? 1 : 0);
    }
    db().prepare("UPDATE claims SET status = ?, stage = 'done', progress = 100, issue_count = ?, model_used = ?, patient_reference = ? WHERE id = ?")
      .run(statusFromIssues(result.issues), result.issues.length, result.modelUsed, patient, claimId);
  })();
}

async function failClaim(claimId, message) {
  db().prepare("UPDATE claims SET status = 'failed', stage = 'failed', error = ? WHERE id = ?").run(String(message).slice(0, 500), claimId);
}

async function failStuckClaims() {
  db().prepare("UPDATE claims SET status = 'failed', stage = 'failed', error = 'The server restarted during analysis. Please upload again.' WHERE status = 'processing'").run();
}

async function listClaims(orgId) {
  return db().prepare(
    'SELECT id, claim_reference, patient_reference, insurer_name, status, issue_count, model_used, created_at FROM claims WHERE org_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 200'
  ).all(orgId);
}

async function stats(orgId) {
  const total = db().prepare('SELECT COUNT(*) AS c, COALESCE(SUM(issue_count), 0) AS s FROM claims WHERE org_id = ?').get(orgId);
  const count = (statuses) => db().prepare(
    `SELECT COUNT(*) AS c FROM claim_issues WHERE org_id = ? AND severity != 'info' AND review_status IN (${statuses.map(() => '?').join(',')})`
  ).get(orgId, ...statuses).c;
  return {
    claimsChecked: total.c,
    openIssues: count(['open']),
    resolvedIssues: count(['verified', 'resolved']),
    avgIssuesPerClaim: total.c ? Math.round((total.s / total.c) * 10) / 10 : 0,
  };
}

async function getClaimStatus(orgId, id) {
  return db().prepare('SELECT status, stage, progress, error FROM claims WHERE org_id = ? AND id = ?').get(orgId, id) || null;
}

async function getClaim(orgId, id) {
  const claim = db().prepare('SELECT * FROM claims WHERE org_id = ? AND id = ?').get(orgId, id);
  if (!claim) return null;
  const documents = db().prepare('SELECT id, doc_type, original_name, extraction_method, extraction_confidence FROM documents WHERE claim_id = ? AND org_id = ?').all(id, orgId);
  const issues = db().prepare('SELECT * FROM claim_issues WHERE claim_id = ? AND org_id = ? ORDER BY rowid').all(id, orgId).map(issueRow);
  return { claim, documents, issues };
}

async function getIssue(orgId, issueId) {
  return issueRow(db().prepare('SELECT * FROM claim_issues WHERE org_id = ? AND id = ?').get(orgId, issueId)) || null;
}

async function updateIssue({ orgId, userId, issueId, reviewStatus }) {
  const reopened = reviewStatus === 'open';
  const r = db().prepare('UPDATE claim_issues SET review_status = ?, reviewed_by = ?, reviewed_at = ? WHERE org_id = ? AND id = ?')
    .run(reviewStatus, reopened ? null : userId, reopened ? null : nowIso(), orgId, issueId);
  if (!r.changes) throw new Error('Issue not found');
  const issue = issueRow(db().prepare('SELECT * FROM claim_issues WHERE id = ?').get(issueId));
  const all = db().prepare('SELECT severity, review_status FROM claim_issues WHERE claim_id = ?').all(issue.claim_id);
  const claimStatus = statusFromIssues(all);
  db().prepare("UPDATE claims SET status = ? WHERE id = ? AND org_id = ? AND status NOT IN ('processing','failed')").run(claimStatus, issue.claim_id, orgId);
  return { issue, claimStatus };
}

async function getDocumentFile(orgId, docId) {
  const row = db().prepare('SELECT * FROM documents WHERE id = ? AND org_id = ?').get(docId, orgId);
  if (!row || !row.storage_path) return null;
  const root = path.resolve(env.uploadsDir);
  const abs = path.resolve(root, row.storage_path);
  if (!abs.startsWith(root + path.sep) || !fs.existsSync(abs)) return null; // never serve outside the uploads folder
  return { abs, mime: row.mime_type || 'application/octet-stream', name: row.original_name || 'document' };
}

module.exports = {
  audit, createClaim, storeDocument, setStage, saveResults, failClaim, failStuckClaims,
  listClaims, stats, getClaimStatus, getClaim, getIssue, updateIssue, getDocumentFile,
};
