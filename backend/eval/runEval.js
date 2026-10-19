// Runs every fictional packet through the real pipeline (no database) and prints an accuracy + speed table.
// Run: npm run eval        (set OLLAMA_MODEL / LLM_PROVIDER in .env first; run the samples script once)
// Laptop-friendly: set EVAL_PAUSE_MS=5000 to rest between packets.
const fs = require('fs');
const path = require('path');
const env = require('../src/config/env');
const { runPipeline } = require('../src/services/pipeline');
const llm = require('../src/llm/llmClient');

const DIR = path.join(__dirname, 'testClaims');
const DOCS = ['claim_form', 'hospital_bill', 'discharge_summary'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!fs.existsSync(DIR)) { console.error('No test claims yet. Run: npm run samples'); process.exit(1); }
  const pause = Number(process.env.EVAL_PAUSE_MS || 0);
  const names = fs.readdirSync(DIR).filter((n) => fs.statSync(path.join(DIR, n)).isDirectory()).sort();
  const rows = [];
  let planted = 0, caught = 0, falseAlerts = 0, manual = 0, totalSec = 0;

  console.log(`Model: ${llm.describe()}\n`);
  for (const name of names) {
    const dir = path.join(DIR, name);
    const expected = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf8')).expected;
    const files = DOCS.filter((t) => fs.existsSync(path.join(dir, `${t}.pdf`)))
      .map((t) => ({ docType: t, buffer: fs.readFileSync(path.join(dir, `${t}.pdf`)), mimetype: 'application/pdf' }));
    const t0 = Date.now();
    let found = [], error = '';
    try {
      const r = await runPipeline(files);
      found = r.issues;
    } catch (e) { error = e.message; }
    const sec = (Date.now() - t0) / 1000;
    const real = [...new Set(found.filter((i) => i.severity !== 'info').map((i) => i.issue_type))];
    const info = found.filter((i) => i.severity === 'info').length;
    const hit = expected.filter((t) => real.includes(t));
    const extra = real.filter((t) => !expected.includes(t));
    planted += expected.length; caught += hit.length; falseAlerts += extra.length; manual += info; totalSec += sec;
    rows.push({ packet: name, expected: expected.join(',') || '-', found: real.join(',') || '-', caught: `${hit.length}/${expected.length}`, falseAlerts: extra.length, manualChecks: info, seconds: sec.toFixed(1), error });
    if (pause) await sleep(pause);
  }
  console.table(rows);
  const summary = { model: llm.describe(), packets: names.length, plantedIssues: planted, caught, recall: planted ? +(caught / planted).toFixed(2) : null, falseAlerts, manualChecks: manual, avgSecondsPerPacket: +(totalSec / names.length).toFixed(1) };
  console.log(summary);
  const file = path.join(__dirname, `results-${env.llmProvider}-${(env.llmProvider === 'groq' ? env.groqModel : env.ollamaModel || 'no-model').replace(/[^\w.-]/g, '_')}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify({ summary, rows }, null, 2));
  console.log(`Saved ${file}`);
})();
