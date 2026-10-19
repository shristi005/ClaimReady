import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const SLOTS = [
  ['claim_form', 'Claim form'],
  ['hospital_bill', 'Hospital bill'],
  ['discharge_summary', 'Discharge summary'],
];
const INSURERS = ['Star Health', 'HDFC ERGO', 'ICICI Lombard', 'Niva Bupa', 'Government scheme (CGHS / ECHS)', 'Other'];
const OK_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const MAX_MB = 10;

export default function NewClaim() {
  const nav = useNavigate();
  const [reference, setReference] = useState('');
  const [insurer, setInsurer] = useState(INSURERS[0]);
  const [files, setFiles] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function pick(slot, file) {
    setError('');
    if (!file) return setFiles((f) => ({ ...f, [slot]: undefined }));
    if (!OK_TYPES.includes(file.type)) return setError('Only PDF, PNG or JPG files can be checked.');
    if (file.size > MAX_MB * 1024 * 1024) return setError(`Each file must be under ${MAX_MB} MB.`);
    setFiles((f) => ({ ...f, [slot]: file }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!Object.values(files).some(Boolean)) return setError('Add at least one document.');
    setError(''); setBusy(true);
    try {
      const form = new FormData();
      form.append('claim_reference', reference);
      form.append('insurer_name', insurer);
      for (const [slot] of SLOTS) if (files[slot]) form.append(slot, files[slot]);
      const { claimId } = await api.analyze(form);
      nav(`/claims/${claimId}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl">
      <h1 className="text-2xl font-semibold">New claim check</h1>
      <p className="mt-1 text-sm text-muted">Upload the claim packet. ClaimReady flags missing documents and mismatches. You decide what to do about them.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Claim reference
          <input required maxLength={60} className="mt-1 w-full rounded border border-line bg-white px-3 py-2 text-sm" value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>
        <label className="text-sm">Insurer
          <select className="mt-1 w-full rounded border border-line bg-white px-3 py-2 text-sm" value={insurer} onChange={(e) => setInsurer(e.target.value)}>
            {INSURERS.map((i) => <option key={i}>{i}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-6 divide-y divide-line rounded border border-line bg-white">
        {SLOTS.map(([slot, label]) => (
          <div key={slot} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted">{files[slot] ? files[slot].name : 'PDF, PNG or JPG, up to 10 MB'}</p>
            </div>
            <label className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm hover:bg-paper">
              {files[slot] ? 'Replace file' : 'Choose file'}
              <input type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => pick(slot, e.target.files[0])} />
            </label>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted">Use fictional documents while testing. Scanned pages should be uploaded as PNG or JPG images.</p>
      {error && <p role="alert" className="mt-3 text-sm text-blocker">{error}</p>}
      <button disabled={busy} className="mt-5 rounded bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60">
        {busy ? 'Uploading...' : 'Check claim'}
      </button>
    </form>
  );
}
