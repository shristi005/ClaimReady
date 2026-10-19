import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, needOrg = true, adminOnly = false }) {
  const { session, me, meError, loading, isAdmin, refreshMe, signOut } = useAuth();
  if (session && !me && meError) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="max-w-sm text-center">
          <p role="alert" className="text-sm text-blocker">{meError}</p>
          <div className="mt-4 flex justify-center gap-3 text-sm">
            <button onClick={refreshMe} className="rounded bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">Try again</button>
            <button onClick={signOut} className="rounded border border-line px-4 py-2">Sign out</button>
          </div>
        </div>
      </div>
    );
  }
  if (loading || (session && !me)) return <p className="p-10 text-muted">Loading...</p>;
  if (!session) return <Navigate to="/login" replace />;
  if (needOrg && !me.membership) return <Navigate to="/onboarding" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return children;
}
