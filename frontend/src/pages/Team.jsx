import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const ROLES = [
  ['admin', 'Admin: manages the team and reviews claims'],
  ['reviewer', 'Reviewer: uploads claims and resolves issues'],
  ['viewer', 'Viewer: read-only'],
];

export default function Team() {
  const { me } = useAuth();
  const [members, setMembers] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('reviewer');
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => api.members().then(setMembers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function createInvite(e) {
    e.preventDefault(); setError(''); setInvite(null);
    try { setInvite(await api.invite({ email, role })); setEmail(''); } catch (err) { setError(err.message); }
  }
  async function change(userId, newRole) {
    setError('');
    try { await api.setRole(userId, newRole); await load(); } catch (err) { setError(err.message); }
  }
  async function reset(m) {
    const pw = window.prompt(`Set a temporary password for ${m.full_name} (at least 10 characters). Ask them to change it after signing in.`);
    if (!pw) return;
    setError(''); setNotice('');
    try { await api.resetMemberPassword(m.user_id, pw); setNotice(`Temporary password set for ${m.full_name}. Their other sessions were signed out.`); } catch (err) { setError(err.message); }
  }
  async function remove(userId) {
    if (!window.confirm('Remove this person from the workspace?')) return;
    setError('');
    try { await api.removeMember(userId); await load(); } catch (err) { setError(err.message); }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Team</h1>
      {error && <p role="alert" className="mt-3 text-sm text-blocker">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-ok">{notice}</p>}

      <form onSubmit={createInvite} className="mt-6 rounded border border-line bg-white p-4">
        <h2 className="font-medium">Invite a colleague</h2>
        <p className="mt-1 text-sm text-muted">They create an account with this email address, then enter the code. The code works once and expires in 7 days.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="sr-only">Colleague email</span>
            <input type="email" required placeholder="name@hospital.com" className="w-64 rounded border border-line px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="sr-only">Role</span>
            <select className="rounded border border-line px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          <button className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Create invite</button>
        </div>
        {invite && (
          <p role="status" className="mt-3 text-sm">Share this code with {invite.email}: <span className="rounded bg-brand-soft px-2 py-1 font-mono text-brand-dark">{invite.code}</span></p>
        )}
      </form>

      <div className="mt-6 overflow-x-auto rounded border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted"><tr><th className="px-4 py-2 font-medium">Name</th><th className="px-4 py-2 font-medium">Email</th><th className="px-4 py-2 font-medium">Role</th><th className="px-4 py-2" /></tr></thead>
          <tbody>
            {members.map((m) => {
              const self = m.user_id === me.user.id;
              return (
                <tr key={m.user_id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">{m.full_name}{self && <span className="ml-2 text-xs text-muted">(you)</span>}</td>
                  <td className="px-4 py-2">{m.email}</td>
                  <td className="px-4 py-2">
                    <select disabled={self} aria-label={`Role for ${m.full_name}`} className="rounded border border-line px-2 py-1 text-sm disabled:opacity-60" value={m.role} onChange={(e) => change(m.user_id, e.target.value)}>
                      {ROLES.map(([k]) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!self && (
                      <span className="flex justify-end gap-4">
                        <button onClick={() => reset(m)} className="text-sm text-brand-dark underline">Reset password</button>
                        <button onClick={() => remove(m.user_id)} className="text-sm text-blocker underline">Remove</button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
