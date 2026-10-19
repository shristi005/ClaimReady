import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { ClaimTable } from './Dashboard';

export default function History() {
  const [claims, setClaims] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');

  useEffect(() => { api.listClaims().then(setClaims).catch((e) => setError(e.message)); }, []);

  const shown = useMemo(() => (claims || []).filter((c) =>
    (status === 'all' || c.status === status) &&
    `${c.claim_reference} ${c.patient_reference || ''} ${c.insurer_name || ''}`.toLowerCase().includes(q.toLowerCase())
  ), [claims, q, status]);

  return (
    <div>
      <h1 className="text-2xl font-semibold">History</h1>
      <div className="mt-4 flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="sr-only">Search claims</span>
          <input className="w-64 rounded border border-line bg-white px-3 py-2 text-sm" placeholder="Search by claim, patient or insurer" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="sr-only">Filter by status</span>
          <select className="rounded border border-line bg-white px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="needs_review">Needs review</option>
            <option value="ready">Ready for review</option>
            <option value="processing">Checking</option>
            <option value="failed">Failed</option>
          </select>
        </label>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-blocker">{error}</p>}
      {claims && (shown.length ? <ClaimTable claims={shown} /> : <p className="mt-4 text-sm text-muted">No claims match.</p>)}
    </div>
  );
}
