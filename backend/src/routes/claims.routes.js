const router = require('express').Router();
const c = require('../controllers/claims.controller');
const upload = require('../middleware/upload');
const { authenticate, requireOrg, requireRole } = require('../middleware/auth');

const guard = [authenticate, requireOrg];
const canEdit = requireRole('admin', 'reviewer');

router.post('/claims/analyze', ...guard, canEdit, upload, c.analyze);
router.get('/claims/stats', ...guard, c.stats);
router.get('/claims', ...guard, c.list);
router.get('/claims/:id/status', ...guard, c.status);
router.get('/claims/:id', ...guard, c.getOne);
router.patch('/issues/:id', ...guard, canEdit, c.patchIssue);
router.get('/documents/:id/file', ...guard, c.downloadDocument);
router.get('/ai-status', ...guard, c.aiStatus);

module.exports = router;
