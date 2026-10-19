// Fast, deterministic extraction of well-labelled fields. The AI only handles what this misses.
const CUR = '(?:Rs\\.?|INR|₹)';
const AMOUNT = `[ \\t]*${CUR}?[ \\t]*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`;
const DATE = '[ \\t]*(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4}|\\d{4}-\\d{1,2}-\\d{1,2})';
const ID = '[ \\t]*([A-Z0-9][A-Z0-9\\-\\/]{2,})';

function grab(text, labelGroups, valuePattern) {
  for (const labels of labelGroups) {
    const re = new RegExp(`(?:${labels.join('|')})[ \\t]*[:\\-]?${valuePattern}`, 'i');
    const m = text.match(re);
    if (m) return { value: m[1].trim(), quote: m[0].trim(), source: 'regex' };
  }
  return null;
}

const SKIP_LINE = /total|claimed|payable|grand|balance|advance|discount/i;

function extractLineItems(text) {
  const items = [];
  const re = new RegExp(`^(.*?[A-Za-z].*?)[\\s:.\\-]*${CUR}[ \\t]*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)$`, 'i');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || SKIP_LINE.test(line)) continue;
    const m = line.match(re);
    if (m) items.push({ description: m[1].trim(), amount: m[2], quote: line, source: 'regex' });
  }
  return items;
}

function regexExtract(text) {
  return {
    claimId: grab(text, [['Claim\\s*(?:ID|No\\.?|Number|Ref(?:erence)?)']], ID),
    patientRef: grab(text, [['Patient\\s*(?:ID|Ref(?:erence)?|No\\.?)', 'UHID']], ID),
    admissionDate: grab(text, [['Date\\s*of\\s*Admission', 'Admission\\s*Date', 'Admitted\\s*on', 'DOA']], DATE),
    dischargeDate: grab(text, [['Date\\s*of\\s*Discharge', 'Discharge\\s*Date', 'Discharged\\s*on', 'DOD']], DATE),
    totalAmount: grab(
      text,
      [['Grand\\s*Total', 'Total\\s*(?:Bill\\s*)?Amount', 'Net\\s*Payable'], ['Total']],
      AMOUNT
    ),
    claimedAmount: grab(text, [['Claimed\\s*Amount', 'Amount\\s*Claimed', 'Claim\\s*Amount']], AMOUNT),
    lineItems: extractLineItems(text),
  };
}

module.exports = { regexExtract };
