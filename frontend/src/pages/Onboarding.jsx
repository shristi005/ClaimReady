import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const input = 'mt-1 w-full rounded border border-line bg-white px-3 py-2 text-sm';

export default function Onboarding() {
  const { me, refreshMe, signOut } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState('create');
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (me?.membership) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await api.bootstrap(mode === 'create' ? { mode, fullName, orgName } : { mode, fullName, code });
      await refreshMe();
      nav('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded border border-line bg-white p-6">
        <h1 className="text-xl font-semibold">Set up your workspace</h1>
        <p className="mt-1 text-sm text-muted">Signed in as {me?.user?.email}</p>

        <div className="mt-4 flex gap-2" role="tablist">
          {[['create', 'Create a hospital workspace'], ['join', 'Join with an invite code']].map(([k, label]) => (
            <button type="button" key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
              className={`rounded px-3 py-1.5 text-sm ${mode === k ? 'bg-brand-soft font-medium text-brand-dark' : 'text-muted'}`}>{label}</button>
          ))}
        </div>

        <label className="mt-4 block text-sm">Your full name
          <input className={input} required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        {mode === 'create' ? (
          <label className="mt-3 block text-sm">Hospital or clinic name
            <input className={input} required value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </label>
        ) : (
          <label className="mt-3 block text-sm">Invite code
            <input className={`${input} font-mono`} required value={code} onChange={(e) => setCode(e.target.value)} />
            <span className="mt-1 block text-xs text-muted">Your admin creates this for the email address you signed in with.</span>
          </label>
        )}
        {mode === 'create' && <p className="mt-2 text-xs text-muted">You will be the admin and can invite your team afterwards.</p>}

        {error && <p role="alert" className="mt-3 text-sm text-blocker">{error}</p>}
        <button disabled={busy} className="mt-5 w-full rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60">
          {busy ? 'Please wait...' : mode === 'create' ? 'Create workspace' : 'Join workspace'}
        </button>
        <button type="button" onClick={signOut} className="mt-3 text-sm text-muted underline">Sign out</button>
      </form>
    </div>
  );
}
