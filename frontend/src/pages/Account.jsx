import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const input = 'mt-1 w-full rounded border border-line bg-white px-3 py-2 text-sm';

export default function Account() {
  const { me } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setDone(false);
    if (next.length < 10) return setError('Use a password of at least 10 characters.');
    if (next !== again) return setError('The new passwords do not match.');
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setDone(true); setCurrent(''); setNext(''); setAgain('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md">
      <h1 className="text-2xl font-semibold">Account</h1>
      <p className="mt-1 text-sm text-muted">{me.user.email} · {me.membership.full_name} · {me.membership.role}</p>

      <h2 className="mt-6 font-medium">Change your password</h2>
      <label className="mt-3 block text-sm">Current password
        <input className={input} type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="mt-3 block text-sm">New password
        <input className={input} type="password" required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label className="mt-3 block text-sm">New password again
        <input className={input} type="password" required autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      </label>
      <p className="mt-2 text-xs text-muted">Changing it signs you out of other devices.</p>
      {error && <p role="alert" className="mt-3 text-sm text-blocker">{error}</p>}
      {done && <p role="status" className="mt-3 text-sm text-ok">Password changed.</p>}
      <button disabled={busy} className="mt-4 rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60">
        {busy ? 'Saving...' : 'Change password'}
      </button>
    </form>
  );
}
