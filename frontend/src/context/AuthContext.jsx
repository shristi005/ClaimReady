import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, token } from '../lib/api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

const IDLE_MS = 30 * 60 * 1000; // the server also enforces this; this just signs out the screen sooner

export function AuthProvider({ children }) {
  const [session, setSession] = useState(token.get());
  const [me, setMe] = useState(null);
  const [meError, setMeError] = useState('');
  const [loading, setLoading] = useState(true);
  const timer = useRef();

  const refreshMe = useCallback(async () => {
    try { setMeError(''); setMe(await api.me()); } catch (e) { setMe(null); setMeError(e.message); }
  }, []);

  useEffect(() => {
    (async () => {
      if (token.get()) await refreshMe();
      setLoading(false);
    })();
    const out = () => { setSession(null); setMe(null); };
    window.addEventListener('claimready:signed-out', out);
    return () => window.removeEventListener('claimready:signed-out', out);
  }, [refreshMe]);

  const signOut = useCallback(async () => {
    await api.logout();
    setSession(null);
    setMe(null);
  }, []);

  useEffect(() => {
    if (!session) return undefined;
    const reset = () => { clearTimeout(timer.current); timer.current = setTimeout(signOut, IDLE_MS); };
    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => { events.forEach((e) => window.removeEventListener(e, reset)); clearTimeout(timer.current); };
  }, [session, signOut]);

  const afterAuth = async () => { setSession(token.get()); await refreshMe(); };
  const login = async (email, password) => { await api.login(email, password); await afterAuth(); };
  const register = async (email, password) => { await api.register(email, password); await afterAuth(); };

  const role = me?.membership?.role;
  const value = {
    session, me, meError, loading, refreshMe, signOut, login, register, role,
    canReview: role === 'admin' || role === 'reviewer',
    isAdmin: role === 'admin',
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
