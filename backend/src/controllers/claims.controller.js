const { z } = require('zod');
const repo = require('../services/claimsRepository');
const llm = require('../llm/llmClient');
const { enqueueAnalysis } = require('../jobs/analysisJob');
const { sniffMime } = require('../utils/fileValidation');
const { REQUIRED_DOCUMENTS, DOC_LABELS } = require('../rules/requiredDocuments');

const analyzeSchema = z.object({
  claim_reference: z.string().trim().min(1, 'Enter a claim reference').max(60),
  insurer_name: z.string().trim().max(80).optional(),
});
const issueSchema = z.object({ review_status: z.enum(['open', 'verified', 'resolved']) });

async function analyze(req, res, next) {
  try {
    const body = analyzeSchema.parse(req.body);
    const files = [];
    for (const docType of REQUIRED_DOCUMENTS) {
      const f = req.files?.[docType]?.[0];
      if (!f) continue;
      const mimetype = sniffMime(f.buffer);
      if (!mimetype) return res.status(400).json({ error: `${DOC_LABELS[docType]} is not a valid PDF, PNG or JPG file.` });
      files.push({ docType, buffer: f.buffer, mimetype, originalname: f.originalname });
    }
    if (!files.length) return res.status(400).json({ error: 'Upload at least one document.' });

    const claim = await repo.createClaim({
      orgId: req.orgId, userId: req.user.id, claimReference: body.claim_reference, insurerName: body.insurer_name,
    });
    try {
      for (const f of files) await repo.storeDocument({ orgId: req.orgId, claimId: claim.id, docType: f.docType, file: f });
    } catch (e) {
      await repo.failClaim(claim.id, e.message);
      throw e;
    }
    await repo.audit({ orgId: req.orgId, userId: req.user.id, claimId: claim.id, action: 'claim_created', detail: { documents: files.map((f) => f.docType) } });
    enqueueAnalysis({ claimId: claim.id, orgId: req.orgId, userId: req.user.id, files });
    res.status(202).json({ claimId: claim.id });
  } catch (e) { next(e); }
}

const list = async (req, res, next) => { try { res.json(await repo.listClaims(req.orgId)); } catch (e) { next(e); } };
const stats = async (req, res, next) => { try { res.json(await repo.stats(req.orgId)); } catch (e) { next(e); } };

async function status(req, res, next) {
  try {
    const s = await repo.getClaimStatus(req.orgId, req.params.id);
    if (!s) return res.status(404).json({ error: 'Claim not found.' });
    res.json(s);
  } catch (e) { next(e); }
}

async function getOne(req, res, next) {
  try {
    const data = await repo.getClaim(req.orgId, req.params.id);
    if (!data) return res.status(404).json({ error: 'Claim not found.' });
    const have = new Set(data.documents.map((d) => d.doc_type));
    const checklist = REQUIRED_DOCUMENTS.map((t) => ({ docType: t, label: DOC_LABELS[t], present: have.has(t) }));
    res.json({ ...data, checklist });
  } catch (e) { next(e); }
}

async function patchIssue(req, res, next) {
  try {
    const { review_status } = issueSchema.parse(req.body);
    const existing = await repo.getIssue(req.orgId, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Issue not found.' });
    const out = await repo.updateIssue({ orgId: req.orgId, userId: req.user.id, issueId: req.params.id, reviewStatus: review_status });
    await repo.audit({ orgId: req.orgId, userId: req.user.id, claimId: existing.claim_id, action: `issue_${review_status}`, detail: { issue: existing.id, type: existing.issue_type } });
    res.json(out);
  } catch (e) { next(e); }
}

async function downloadDocument(req, res, next) {
  try {
    const f = await repo.getDocumentFile(req.orgId, req.params.id);
    if (!f) return res.status(404).json({ error: 'File not found.' });
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.name)}"`);
    res.sendFile(f.abs);
  } catch (e) { next(e); }
}

const aiStatus = async (req, res, next) => { try { res.json(await llm.status()); } catch (e) { next(e); } };

module.exports = { analyze, list, stats, status, getOne, patchIssue, aiStatus, downloadDocument };
