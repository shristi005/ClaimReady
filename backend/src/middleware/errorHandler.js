const { ZodError } = require('zod');

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues.map((i) => i.message).join(' ') });
  }
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'A file is too large.' : err.message });
  }
  if (err.message === 'Only PDF, PNG and JPG files are allowed') {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
};
