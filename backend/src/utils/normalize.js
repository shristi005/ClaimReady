// Amounts: "Rs. 54,000.50" -> 54000.5
function normalizeAmount(raw) {
  if (raw === null || raw === undefined) return null;
  // Remove currency words first: the "." in "Rs." must not survive as a decimal point.
  const cleaned = String(raw).replace(/rs\.?|inr|₹/gi, '').replace(/[^0-9.]/g, '');
  if (!cleaned || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// Dates: day-first (Indian convention) "12/03/2026" -> "2026-03-12". ISO also accepted.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function normalizeDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace(/(\d)(st|nd|rd|th)\b/i, '$1');
  let d, m, y;
  let match = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  const dayFirst = s.match(/^(\d{1,2})[ \-]([A-Za-z]{3,9})\.?,?[ \-](\d{4})$/);
  const monthFirst = s.match(/^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/);
  if (match) {
    y = +match[1]; m = +match[2]; d = +match[3];
  } else if (dayFirst && MONTHS.includes(dayFirst[2].slice(0, 3).toLowerCase())) {
    d = +dayFirst[1]; m = MONTHS.indexOf(dayFirst[2].slice(0, 3).toLowerCase()) + 1; y = +dayFirst[3];
  } else if (monthFirst && MONTHS.includes(monthFirst[1].slice(0, 3).toLowerCase())) {
    m = MONTHS.indexOf(monthFirst[1].slice(0, 3).toLowerCase()) + 1; d = +monthFirst[2]; y = +monthFirst[3];
  } else {
    match = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (!match) return null;
    d = +match[1]; m = +match[2]; y = +match[3];
    if (y < 100) y += 2000;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function normalizeId(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase().replace(/[.,;:]+$/, '');
  return s || null;
}

function formatInr(n) {
  return n === null || n === undefined ? '' : 'Rs. ' + Number(n).toLocaleString('en-IN');
}

module.exports = { normalizeAmount, normalizeDate, normalizeId, formatInr };
