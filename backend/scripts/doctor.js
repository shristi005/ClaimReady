// Checks that this computer is ready to run ClaimReady and the local AI. Safe to run any time.
// Usage: npm run doctor
const os = require('os');
const fs = require('fs');
const path = require('path');
const env = require('../src/config/env');
const llm = require('../src/llm/llmClient');
const { parseFields } = require('../src/services/fieldParser');

let fails = 0;
const pass = (m) => console.log(`PASS  ${m}`);
const warn = (m) => console.log(`WARN  ${m}`);
const fail = (m) => { fails++; console.log(`FAIL  ${m}`); };

// Messy wording on purpose: regex cannot read this, so the model has to.
const SAMPLE = [
  'Fictional City Hospital - Invoice', 'Case number: CL-1042', 'Patient: P-2231',
  'Checked in: 12/03/2026', 'Checked out: 15/03/2026',
  'Room Charges (3 days) Rs. 20,000', 'Surgeon Fee Rs. 15,000', 'Medicines Rs. 10,000',
  'Bill payable by insurer: Rs. 45,000',
].join('\n');
const EXPECT = { claimId: 'CL-1042', patientRef: 'P-2231', admissionDate: '2026-03-12', dischargeDate: '2026-03-15', totalAmount: 45000 };

async function installedModels() {
  try {
    const r = await fetch(`${env.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return r.ok ? ((await r.json()).models || []).map((m) => m.name) : null;
  } catch { return null; }
}

async function timedRead() {
  const t0 = Date.now();
  const out = await parseFields('hospital_bill', SAMPLE);
  const correct = Object.entries(EXPECT).filter(([k, v]) => out.fields[k]?.norm === v).length;
  return { out, correct, sec: (Date.now() - t0) / 1000 };
}

(async () => {
  console.log('ClaimReady setup check\n');

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) fail(`Node ${process.versions.node} is too old for ClaimReady. Install the current Node LTS (22 or newer) from nodejs.org, then reopen PowerShell.`);
  else pass(`Node ${process.versions.node}`);

  try {
    fs.mkdirSync(env.dataDir, { recursive: true });
    const probe = path.join(env.dataDir, '.write-test');
    fs.writeFileSync(probe, 'ok'); fs.unlinkSync(probe);
    require('../src/db').getDb().prepare('SELECT 1').get();
    pass(`Database and uploads folder are writable (${env.dataDir})`);
  } catch (e) {
    if (/better-sqlite3/.test(e.message)) {
      fail('The database package is not installed. In this folder run: npm install   (if it shows red errors, send me that text)');
    } else {
      fail(`Cannot use the data folder: ${e.message}`);
    }
  }

  fs.existsSync(path.join(env.webDir, 'index.html'))
    ? pass('Web app is built (npm start will serve it on one port)')
    : warn('Web app is not built yet. Run: npm run demo   (or: cd ../frontend && npm run build)');

  const freeGb = os.freemem() / 1024 ** 3;
  freeGb < 2.5
    ? warn(`Only ${freeGb.toFixed(1)} GB of memory is free right now. Close Chrome tabs and other apps before analysing.`)
    : pass(`${freeGb.toFixed(1)} GB of memory free`);

  if (env.llmProvider === 'ollama') {
    const models = await installedModels();
    if (!models) {
      fail(`Cannot reach Ollama at ${env.ollamaUrl}. Install it from ollama.com and open the Ollama app, then run this again.`);
    } else if (!env.ollamaModel) {
      fail(`OLLAMA_MODEL is empty in backend/.env. Installed models: ${models.join(', ') || 'none yet (run: ollama pull <name>)'}`);
    } else if (!models.some((n) => n === env.ollamaModel || n === `${env.ollamaModel}:latest`)) {
      fail(`Model "${env.ollamaModel}" is not installed. Run: ollama pull ${env.ollamaModel}   (installed: ${models.join(', ') || 'none'})`);
    } else {
      pass(`Ollama is running and "${env.ollamaModel}" is installed`);
    }
  } else if (!env.groqApiKey) {
    fail('LLM_PROVIDER=groq but GROQ_API_KEY is empty in backend/.env');
  }

  if (!fails) {
    console.log('\nTrying the AI on a sample with unusual wording (first run loads the model, so it is slower)...');
    try {
      const first = await timedRead();
      if (first.out.llmError) throw new Error(first.out.llmError);
      const second = await timedRead();
      const quality = `${second.correct} of 5 fields read correctly`;
      const speed = `first run ${first.sec.toFixed(1)}s, second run ${second.sec.toFixed(1)}s`;
      if (second.out.llmError) throw new Error(second.out.llmError);
      if (second.correct >= 4) pass(`AI works: ${quality} (${speed})`);
      else if (second.correct >= 2) warn(`AI is weak on this sample: ${quality} (${speed}). Try a different model and compare with npm run eval.`);
      else fail(`AI result: ${quality}. Rejected answers: ${second.out.rejected.length}. Try a different model.`);
      if (second.sec > 60) warn('Each document takes over a minute. Expect long waits; a smaller model or closing other apps will help.');
      else if (second.sec > 25) warn('Each document takes a while. Fine for a demo, but show the progress screen and say the AI runs locally.');
      if (second.correct < 5) {
        console.log('\n      field            expected     AI answer (what it said)            result');
        for (const [k, want] of Object.entries(EXPECT)) {
          const got = second.out.fields[k];
          const rej = second.out.rejected.find((r) => r.field === k);
          const said = got ? got.value : rej ? `${rej.value} (quote: ${rej.quote || '-'})` : '(nothing)';
          const verdict = got ? (got.norm === want ? 'correct' : `WRONG (read as ${got.norm})`) : rej ? 'rejected by safety check' : 'not found';
          console.log(`      ${k.padEnd(16)} ${String(want).padEnd(12)} ${String(said).slice(0, 44).padEnd(44)} ${verdict}`);
        }
        console.log('');
      }
      if (second.out.rejected.length) console.log(`      (${second.out.rejected.length} answer(s) were rejected because their quote was not in the document. That is the safety check working.)`);
    } catch (e) {
      fail(`The AI test failed: ${e.message}`);
    }
  }

  console.log(fails ? `\n${fails} problem(s) to fix before recording.` : '\nReady.');
  process.exit(fails ? 1 : 0);
})();
