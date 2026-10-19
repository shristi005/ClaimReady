const multer = require('multer');
const env = require('../config/env');

const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 3 },
  fileFilter: (req, file, cb) =>
    ALLOWED.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only PDF, PNG and JPG files are allowed')),
});

module.exports = upload.fields([
  { name: 'claim_form', maxCount: 1 },
  { name: 'hospital_bill', maxCount: 1 },
  { name: 'discharge_summary', maxCount: 1 },
]);
