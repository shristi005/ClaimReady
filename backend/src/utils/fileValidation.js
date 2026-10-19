// Do not trust the browser-reported mime type: check the file's first bytes.
function sniffMime(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf.slice(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buf[0] === 0x89 && buf.slice(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

function safeName(name) {
  return String(name || 'file').replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
}

module.exports = { sniffMime, safeName };
