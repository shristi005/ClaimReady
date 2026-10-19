// Generates FICTIONAL claim packets (PDF) with planted errors, plus an answer key.
// Run: npm run samples   ->   eval/testClaims/<packet>/{claim_form,hospital_bill,discharge_summary}.pdf + expected.json
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'eval', 'testClaims');
const inr = (n) => 'Rs. ' + n.toLocaleString('en-IN');
const ITEMS = [['Room Charges (3 days)', 18000], ['Surgeon Fee', 15000], ['Medicines', 7000], ['Diagnostic Tests', 5000]];

function packet(o = {}) {
  const p = {
    claimId: 'CL-1042', billClaimId: null, patient: 'P-2231', summaryPatient: null,
    admit: '12/03/2026', discharge: '15/03/2026', billDischarge: null,
    items: ITEMS, total: null, claimed: null, messy: false, skip: [], ...o,
  };
  const sum = p.items.reduce((s, i) => s + i[1], 0);
  const total = p.total ?? sum;
  const claimed = p.claimed ?? total;
  const hosp = 'Fictional City Hospital';
  const docs = {};
  if (p.messy) {
    docs.claim_form = [`${hosp} - Insurance Claim`, `Case number: ${p.claimId}`, `Patient: ${p.patient}`, `Checked in: ${p.admit}`, `Checked out: ${p.discharge}`, `Sum requested from insurer: ${inr(claimed)}`];
    docs.hospital_bill = [`${hosp} - Invoice`, `Case number: ${p.billClaimId || p.claimId}`, `Patient: ${p.patient}`, `Checked in: ${p.admit}`, `Checked out: ${p.billDischarge || p.discharge}`, ...p.items.map((i) => `${i[0]} ${inr(i[1])}`), `Bill payable by insurer: ${inr(total)}`];
    docs.discharge_summary = [`${hosp} - Discharge Summary`, `Patient: ${p.summaryPatient || p.patient}`, `Checked in: ${p.admit}`, `Checked out: ${p.discharge}`, 'Condition at discharge: stable.'];
  } else {
    docs.claim_form = [`${hosp} - CLAIM FORM`, `Claim ID: ${p.claimId}`, `Patient ID: ${p.patient}`, `Date of Admission: ${p.admit}`, `Date of Discharge: ${p.discharge}`, `Claimed Amount: ${inr(claimed)}`];
    docs.hospital_bill = [`${hosp} - HOSPITAL BILL`, `Claim ID: ${p.billClaimId || p.claimId}`, `Patient ID: ${p.patient}`, `Date of Admission: ${p.admit}`, `Date of Discharge: ${p.billDischarge || p.discharge}`, ...p.items.map((i) => `${i[0]} ${inr(i[1])}`), `Total Amount: ${inr(total)}`];
    docs.discharge_summary = [`${hosp} - DISCHARGE SUMMARY`, `Patient ID: ${p.summaryPatient || p.patient}`, `Date of Admission: ${p.admit}`, `Date of Discharge: ${p.discharge}`, 'Condition at discharge: stable.'];
  }
  for (const s of p.skip) delete docs[s];
  return docs;
}

const PACKETS = [
  { name: '01-clean', docs: packet(), expected: [] },
  { name: '02-amount-mismatch', docs: packet({ claimed: 54000 }), expected: ['AMOUNT_MISMATCH'] },
  { name: '03-missing-discharge', docs: packet({ skip: ['discharge_summary'] }), expected: ['MISSING_DOCUMENT'] },
  { name: '04-date-order', docs: packet({ billDischarge: '10/03/2026' }), expected: ['DATE_ORDER', 'DATE_MISMATCH'] },
  { name: '05-sum-error', docs: packet({ total: 47000 }), expected: ['SUM_MISMATCH', 'AMOUNT_MISMATCH'].slice(0, 1) },
  { name: '06-id-mismatch', docs: packet({ billClaimId: 'CL-1043' }), expected: ['ID_MISMATCH'] },
  { name: '07-two-errors', docs: packet({ claimed: 50000, summaryPatient: 'P-9999' }), expected: ['AMOUNT_MISMATCH', 'PATIENT_MISMATCH'] },
  { name: '08-clean-messy-wording', docs: packet({ messy: true }), expected: [] },
  { name: '09-messy-amount-mismatch', docs: packet({ messy: true, claimed: 54000, total: 45000, items: [['Room Charges (3 days)', 20000], ['Surgeon Fee', 15000], ['Medicines', 10000]] }), expected: ['AMOUNT_MISMATCH'] },
];

// Minimal hand-built text PDF (deterministic, no dependencies).
function buildPdf(lines) {
  const esc = (t) => t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const content = ['BT', '/F1 12 Tf', '50 780 Td', '18 TL', ...lines.map((l) => `(${esc(l)}) Tj T*`), 'ET'].join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

(() => {
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const p of PACKETS) {
    const dir = path.join(OUT, p.name);
    fs.mkdirSync(dir, { recursive: true });
    for (const [type, lines] of Object.entries(p.docs)) fs.writeFileSync(path.join(dir, `${type}.pdf`), buildPdf(lines));
    fs.writeFileSync(path.join(dir, 'expected.json'), JSON.stringify({ expected: p.expected }, null, 2));
  }
  console.log(`Wrote ${PACKETS.length} fictional packets to ${OUT}`);
})();
