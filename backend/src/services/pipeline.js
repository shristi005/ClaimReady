// The whole analysis, with no database: files in, report out. Also used by the eval script.
const { extractText } = require('./documentExtractor');
const { parseFields } = require('./fieldParser');
const { validateClaim } = require('./claimValidator');
const llm = require('../llm/llmClient');

async function runPipeline(files, onStage = async () => {}) {
  const documents = [];
  const extracted = {};
  const n = files.length;

  await onStage('reading', 10);
  for (let i = 0; i < n; i++) {
    const f = files[i];
    const ex = await extractText(f.buffer, f.mimetype);
    documents.push({ docType: f.docType, method: ex.method, confidence: ex.confidence, text: ex.text });
    await onStage('reading', 10 + Math.round(((i + 1) / n) * 25));
  }

  await onStage('extracting', 40);
  for (let i = 0; i < documents.length; i++) {
    const d = documents[i];
    extracted[d.docType] = await parseFields(d.docType, d.text); // one document at a time (RAM)
    await onStage('extracting', 40 + Math.round(((i + 1) / documents.length) * 45));
  }

  await onStage('checking', 90);
  const issues = validateClaim({ documentTypes: files.map((f) => f.docType), extracted });
  return { documents, extracted, issues, modelUsed: llm.describe() };
}

module.exports = { runPipeline };
