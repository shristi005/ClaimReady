import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import { ArrowRight, CircleDollarSign, FileCheck2, FolderOpen, MessageSquareText } from 'lucide-react';

export const when = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export default function Dashboard() {
  const { canReview } = useAuth();
  const [stats, setStats] = useState(null);
  const [claims, setClaims] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.stats(), api.listClaims()]).then(([s, c]) => { setStats(s); setClaims(c); }).catch((e) => setError(e.message));
  }, []);

  const items = stats && [
    ['Claims checked', stats.claimsChecked],
    ['Issues waiting for review', stats.openIssues],
    ['Issues verified or resolved', stats.resolvedIssues],
    ['Average issues per claim', stats.avgIssuesPerClaim],
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Dashboard</h1><p className="mt-1 text-sm text-muted">Check claim documents, follow up with insurers, and keep track of payments.</p></div>
        {canReview && <Link to="/new" className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">New claim check</Link>}
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-blocker">{error}</p>}

      <section className="mt-6 rounded-2xl border border-indigo-100 bg-gradient-to-r from-white to-indigo-50 p-5 md:p-6">
        <h2 className="text-lg font-semibold">A simple way to use ClaimReady</h2>
        <p className="mt-1 text-sm text-slate-600">Start with a claim. Then use the follow-up tools when you need them.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <Link to="/new" className="group rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300"><div className="flex items-center gap-2 text-sm font-semibold"><FileCheck2 size={17} className="text-indigo-600"/>1. Check the documents</div><p className="mt-2 text-xs leading-5 text-slate-500">Upload the claim form, bill and discharge summary. Review missing files or details that don’t match.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-indigo-700">Start a claim check <ArrowRight size={13}/></span></Link>
          <Link to="/queries" className="group rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300"><div className="flex items-center gap-2 text-sm font-semibold"><MessageSquareText size={17} className="text-indigo-600"/>2. Handle insurer questions</div><p className="mt-2 text-xs leading-5 text-slate-500">Record the question and due date. Find related details in files and prepare a reply for staff to review.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-indigo-700">Open Query Desk <ArrowRight size={13}/></span></Link>
          <Link to="/payments" className="group rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300"><div className="flex items-center gap-2 text-sm font-semibold"><CircleDollarSign size={17} className="text-indigo-600"/>3. Track money and files</div><p className="mt-2 text-xs leading-5 text-slate-500">Enter settlement amounts yourself, then organize claim documents into a downloadable packet.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-indigo-700">Payment & packet tools <FolderOpen size={13}/></span></Link>
        </div>
        <p className="mt-4 border-t border-indigo-100 pt-3 text-xs text-slate-500">ClaimReady helps staff review and organize work. It does not decide claims or send anything to insurers.</p>
      </section>

      {items && (
        <dl className="mt-6 grid grid-cols-2 divide-x divide-line rounded border border-line bg-white md:grid-cols-4">
          {items.map(([label, value]) => (
            <div key={label} className="px-5 py-4">
              <dd className="text-2xl font-semibold">{value}</dd>
              <dt className="mt-1 text-sm text-muted">{label}</dt>
            </div>
          ))}
        </dl>
      )}

      <h2 className="mt-10 text-lg font-medium">Recent claims</h2>
      {claims && claims.length === 0 && (
        <p className="mt-3 text-sm text-muted">No claims yet. {canReview ? 'Start with a new claim check and upload a claim form, a bill and a discharge summary.' : 'Ask a reviewer to add the first claim.'}</p>
      )}
      {claims && claims.length > 0 && <ClaimTable claims={claims.slice(0, 8)} />}
    </div>
  );
}

export function ClaimTable({ claims }) {
  return (
    <div className="mt-3 overflow-x-auto rounded border border-line bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-muted">
          <tr><th className="px-4 py-2 font-medium">Claim</th><th className="px-4 py-2 font-medium">Patient</th><th className="px-4 py-2 font-medium">Insurer</th><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2 font-medium">Issues</th><th className="px-4 py-2 font-medium">Created</th></tr>
        </thead>
        <tbody>
          {claims.map((c) => (
            <tr key={c.id} className="border-b border-line last:border-0 hover:bg-paper">
              <td className="px-4 py-2"><Link className="font-medium text-brand-dark underline" to={`/claims/${c.id}`}>{c.claim_reference}</Link></td>
              <td className="px-4 py-2 font-mono text-xs">{c.patient_reference || '-'}</td>
              <td className="px-4 py-2">{c.insurer_name || '-'}</td>
              <td className="px-4 py-2"><StatusBadge value={c.status} /></td>
              <td className="px-4 py-2">{c.issue_count}</td>
              <td className="px-4 py-2 text-muted">{when(c.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
