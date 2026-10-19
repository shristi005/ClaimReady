// Turns an uploaded file into plain text. Digital PDFs use pdf.js; images use OCR (tesseract.js).
function clean(text) {
  return String(text)
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

async function pdfText(buffer) {
  // pdfjs-dist is an ES module, so load it with a dynamic import from this CommonJS file.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer), // private copy
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;
  let out = '';
  try {
    for (let p = 1; p <= Math.min(doc.numPages, 20); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      for (const item of content.items) {
        out += item.str;
        if (item.hasEOL) out += '\n';
      }
      out += '\n';
    }
  } finally {
    await doc.destroy();
  }
  return out;
}

async function extractText(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    let raw;
    try {
      raw = await pdfText(buffer);
    } catch (e) {
      throw new Error(`Could not read this PDF (${e.message}). Re-save it as a new PDF, or upload it as a PNG or JPG image.`);
    }
    const text = clean(raw);
    if (text.length < 30) {
      throw new Error('This PDF has no readable text (it looks scanned). Upload it as a PNG or JPG image instead.');
    }
    return { text, method: 'pdf_text', confidence: 1 };
  }
  // Lazy-load OCR so tests and PDF-only runs stay light.
  const { createWorker } = require('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(buffer);
    const text = clean(data.text || '');
    if (text.length < 20) throw new Error('Could not read any text from this image. Try a sharper photo or scan.');
    return { text, method: 'ocr', confidence: Math.round(data.confidence) / 100 };
  } finally {
    await worker.terminate();
  }
}

module.exports = { extractText };
