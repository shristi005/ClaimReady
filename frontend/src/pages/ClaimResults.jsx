import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Circle, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import IssueCard, { DOC } from '../components/IssueCard';

const STAGES = [
  ['queued', 'Waiting in line'],
  ['reading', 'Reading documents'],
  ['extracting', 'Extracting fields'],
  ['checking', 'Checking rules'],
];

function Progress({ status, elapsed }) {
  const idx = Math.max(0, STAGES.findIndex(([k]) => k === status?.stage));
  return (
    <section className="rounded border border-line bg-white p-5" aria-live="polite">
      <h2 className="font-medium">Checking your claim</h2>
      <p className="mt-1 text-sm text-muted">The AI runs on this computer, so this can take up to a minute. {elapsed}s so far.</p>
      <ol className="mt-4 space-y-2">
        {STAGES.map(([k, label], i) => (
          <li key={k} className={`flex items-center gap-2 text-sm ${i === idx ? 'font-medium' : i < idx ? 'text-ok' : 'text-muted'}`}>
            {i < idx ? <CheckCircle2 size={16} /> : <Circle size={16} />}{label}
          </li>
        ))}
      </ol>
      <div className="mt-4 h-1.5 overflow-hidden rounded bg-line"><div className="h-full bg-brand transition-all" style={{ width: `${status?.progress || 5}%` }} /></div>
    </section>
  );
}

export default function ClaimResults() {
  const { id } = useParams();
  const { canReview } = useAuth();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(Date.now());

  const load = useCallback(async () => {
    try { setData(await api.getClaim(id)); } catch (e) { setError(e.message); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (data?.claim.status !== 'processing') return undefined;
    const t = setInterval(async () => {
      setElapsed(Math.round((Date.now() - started.current) / 1000));
      try {
        const s = await api.getStatus(id);
        setStatus(s);
        if (s.status !== 'processing') await load();
      } catch { /* keep polling */ }
    }, 2000);
    return () => clearInterval(t);
  }, [data?.claim.status, id, load]);

  async function setIssue(issueId, review_status) {
    setBusy(true); setError('');
    try { await api.setIssueStatus(issueId, review_status); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (error && !data) return <p role="alert" className="text-sm text-blocker">{error}</p>;
  if (!data) return <p className="text-muted">Loading...</p>;

  const { claim, issues, checklist, documents } = data;
  const open = issues.filter((i) => i.severity !== 'info' && i.review_status === 'open').length;
  const manual = issues.filter((i) => i.severity === 'info' && i.review_status === 'open').length;
  const groups = [['blocker', 'Blockers'], ['review', 'To review'], ['info', 'Check manually']];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{claim.claim_reference}</h1>
        <StatusBadge value={claim.status} />
      </div>
      <p className="mt-1 text-sm text-muted">{claim.insurer_name || 'No insurer chosen'}{claim.model_used ? ` · checked with ${claim.model_used}` : ''}</p>
      {error && <p role="alert" className="mt-3 text-sm text-blocker">{error}</p>}

      <div className="mt-6">
        {claim.status === 'processing' && <Progress status={status || claim} elapsed={elapsed} />}
        {claim.status === 'failed' && (
          <div role="alert" className="flex gap-2 rounded border border-red-200 bg-red-50 p-4 text-sm text-blocker">
            <XCircle size={18} className="mt-0.5 shrink-0" />
            <div><p className="font-medium">This claim could not be checked.</p><p className="mt-1">{claim.error}</p><p className="mt-1">Fix the problem and upload the documents again.</p></div>
          </div>
        )}
        {(claim.status === 'needs_review' || claim.status === 'ready') && (
          <div className={`rounded border p-4 text-sm ${open === 0 && manual === 0 ? 'border-green-200 bg-green-50 text-ok' : 'border-amber-200 bg-amber-50 text-review'}`}>
            {open > 0
              ? `${open} ${open === 1 ? 'issue still needs' : 'issues still need'} your review before submission.`
              : manual > 0
                ? `No blocking issues, but ${manual} ${manual === 1 ? 'field needs' : 'fields need'} a manual check below before submission.`
                : 'No open issues. This packet is ready for your final review before submission.'}
            <span className="ml-1 text-muted">ClaimReady flags possible problems. It does not approve or reject claims.</span>
          </div>
        )}
      </div>

      {claim.status !== 'processing' && claim.status !== 'failed' && (
        <div className="mt-6 grid gap-6 md:grid-cols-[14rem_1fr]">
          <aside>
            <h2 className="font-medium">Documents</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {checklist.map((c) => (
                <li key={c.docType} className="flex items-center gap-2">
                  {c.present ? <CheckCircle2 size={16} className="text-ok" /> : <XCircle size={16} className="text-blocker" />}
                  <span>{c.label}</span>
                </li>
              ))}
            </ul>
            <h2 className="mt-5 font-medium">Original files</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {documents.map((d) => (
                <li key={d.id}>
                  <button onClick={() => api.openDocument(d.id).catch((e) => setError(e.message))} className="text-brand-dark underline">{DOC[d.doc_type]}</button>
                  <span className="block text-xs text-muted">{d.extraction_method === 'ocr' ? 'Read by OCR' : 'Read from PDF text'}</span>
                </li>
              ))}
            </ul>
          </aside>

          <section className="space-y-6">
            {issues.length === 0 && <p className="text-sm text-muted">No issues found. Every required check passed.</p>}
            {groups.map(([sev, label]) => {
              const list = issues.filter((i) => i.severity === sev);
              return list.length ? (
                <div key={sev}>
                  <h2 className="mb-2 font-medium">{label} ({list.length})</h2>
                  <div className="space-y-3">{list.map((i) => <IssueCard key={i.id} issue={i} canReview={canReview} busy={busy} onSet={setIssue} />)}</div>
                </div>
              ) : null;
            })}
          </section>
        </div>
      )}
    </div>
  );
}
