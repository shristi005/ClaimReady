const base = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium';

const CLAIM = {
  processing: ['Checking', 'bg-blue-50 text-info'],
  needs_review: ['Needs review', 'bg-amber-50 text-review'],
  ready: ['Ready for review', 'bg-green-50 text-ok'],
  failed: ['Failed', 'bg-red-50 text-blocker'],
};
const SEVERITY = {
  blocker: ['Blocker', 'bg-red-50 text-blocker'],
  review: ['Needs review', 'bg-amber-50 text-review'],
  info: ['Check manually', 'bg-slate-100 text-slate-700'],
};
const REVIEW = {
  open: ['Open', 'bg-slate-100 text-slate-700'],
  verified: ['Verified', 'bg-green-50 text-ok'],
  resolved: ['Resolved', 'bg-green-50 text-ok'],
};

const make = (map) => function Badge({ value }) {
  const [label, cls] = map[value] || [value, 'bg-slate-100 text-slate-700'];
  return <span className={`${base} ${cls}`}>{label}</span>;
};

export const StatusBadge = make(CLAIM);
export const SeverityBadge = make(SEVERITY);
export const ReviewBadge = make(REVIEW);
