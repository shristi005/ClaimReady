import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const input = 'mt-1 w-full rounded border border-line bg-white px-3 py-2 text-sm';

export default function Login() {
  const { session, loading, login, register } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      if (mode === 'signup' && password.length < 10) throw new Error('Use a password of at least 10 characters.');
      await (mode === 'signin' ? login : register)(email, password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-brand-dark">ClaimReady</h1>
        <p className="mt-1 text-sm text-muted">Check insurance claim packets before you submit them.</p>

        <form onSubmit={submit} className="mt-6 rounded border border-line bg-white p-5">
          <h2 className="font-medium">{mode === 'signin' ? 'Sign in' : 'Create your account'}</h2>
          <label className="mt-4 block text-sm">Work email
            <input className={input} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="mt-3 block text-sm">Password
            <input className={input} type="password" required autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {mode === 'signup' && <p className="mt-1 text-xs text-muted">At least 10 characters. Everything is stored on this computer.</p>}
          {error && <p role="alert" className="mt-3 text-sm text-blocker">{error}</p>}
          <button disabled={busy} className="mt-4 w-full rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60">
            {busy ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }} className="mt-4 text-sm text-brand-dark underline">
          {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
        {mode === 'signin' && <p className="mt-3 text-xs text-muted">Forgot your password? Ask your workspace admin to set a temporary one.</p>}
      </div>
    </div>
  );
}
