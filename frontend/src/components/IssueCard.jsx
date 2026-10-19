import { SeverityBadge, ReviewBadge } from './StatusBadge';

export const DOC = { claim_form: 'Claim form', hospital_bill: 'Hospital bill', discharge_summary: 'Discharge summary' };
const BORDER = { blocker: 'border-l-blocker', review: 'border-l-review', info: 'border-l-slate-400' };

function Excerpt({ e }) {
  return (
    <figure className="rounded border border-line bg-paper p-3">
      <figcaption className="text-xs text-muted">{DOC[e.document] || e.document}</figcaption>
      <blockquote className="mt-1 break-words font-mono text-sm">{e.quote || e.value || '-'}</blockquote>
    </figure>
  );
}

export default function IssueCard({ issue, canReview, busy, onSet }) {
  const done = issue.review_status !== 'open';
  const evidence = issue.evidence || [];
  return (
    <article className={`rounded border border-line border-l-4 bg-white p-4 ${BORDER[issue.severity]} ${done ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge value={issue.severity} />
        <ReviewBadge value={issue.review_status} />
        {!issue.grounded && <span className="text-xs text-muted">Could not be confirmed in the document</span>}
      </div>
      <p className="mt-2 font-medium">{issue.message}</p>
      {issue.expected && issue.found && (
        <p className="mt-1 text-sm text-muted">Expected: <span className="font-mono text-ink">{issue.expected}</span> · Found: <span className="font-mono text-ink">{issue.found}</span></p>
      )}
      {evidence.length > 0 && (
        <div className={`mt-3 grid gap-3 ${evidence.length > 1 ? 'sm:grid-cols-2' : ''}`}>
          {evidence.map((e, i) => <Excerpt key={i} e={e} />)}
        </div>
      )}
      <p className="mt-3 text-sm">{issue.action}</p>
      {canReview && (
        <div className="mt-3 flex flex-wrap gap-2">
          {issue.review_status === 'open' ? (
            <>
              <button disabled={busy} onClick={() => onSet(issue.id, 'verified')} className="rounded border border-line px-3 py-1.5 text-sm hover:bg-paper disabled:opacity-60">Mark verified</button>
              <button disabled={busy} onClick={() => onSet(issue.id, 'resolved')} className="rounded bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark disabled:opacity-60">Mark resolved</button>
            </>
          ) : (
            <button disabled={busy} onClick={() => onSet(issue.id, 'open')} className="rounded border border-line px-3 py-1.5 text-sm hover:bg-paper disabled:opacity-60">Reopen</button>
          )}
        </div>
      )}
    </article>
  );
}
