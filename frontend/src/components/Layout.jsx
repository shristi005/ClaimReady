import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Activity, Bell, FilePlus2, History, LayoutDashboard, LogOut, MessageSquareText, Settings, Users, CreditCard, FolderArchive } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

function AiBadge() {
  const [s, setS] = useState(null);
  useEffect(() => { api.aiStatus().then(setS).catch(() => setS({ reachable: false })); }, []);
  if (!s) return null;
  const ok = s.reachable && s.modelInstalled;
  return <span className={`rounded-full px-3 py-1 text-xs ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{ok ? `${s.provider === 'ollama' ? 'Local AI' : 'Cloud AI'} ready` : 'AI unavailable'}</span>;
}
const link = ({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${isActive ? 'bg-indigo-700 text-white shadow-sm' : 'text-indigo-100/75 hover:bg-white/10 hover:text-white'}`;
export default function Layout() {
  const { me, signOut, canReview, isAdmin } = useAuth();
  return <div className="min-h-screen bg-[#f3f5fb] text-slate-900 lg:flex">
    <aside className="flex w-full flex-col bg-[#111735] text-white lg:fixed lg:inset-y-0 lg:w-60">
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-300 to-cyan-500 font-bold text-[#10213b]">C</span><div><div className="font-semibold tracking-tight">ClaimReady</div><div className="text-[10px] text-indigo-200/70">SMARTER CLAIMS, FASTER PAYMENTS</div></div></div>
      <nav className="flex gap-1 overflow-x-auto p-3 lg:flex-col lg:overflow-visible" aria-label="Main">
        <NavLink to="/" end className={link}><LayoutDashboard size={17}/>Dashboard</NavLink>
        {canReview && <NavLink to="/new" className={link}><FilePlus2 size={17}/>New claim check</NavLink>}
        <NavLink to="/history" className={link}><History size={17}/>Claims</NavLink>
        <NavLink to="/queries" className={link}><MessageSquareText size={17}/>Query Desk</NavLink>
        <NavLink to="/payments" className={link}><CreditCard size={17}/>Payment tracking</NavLink>
        <NavLink to="/packets" className={link}><FolderArchive size={17}/>Packet builder</NavLink>
        {isAdmin && <NavLink to="/team" className={link}><Users size={17}/>Team</NavLink>}
        <NavLink to="/account" className={link}><Settings size={17}/>Settings</NavLink>
      </nav>
      <div className="mt-auto hidden p-4 lg:block"><div className="rounded-xl bg-white/10 p-3"><div className="text-sm font-medium">{me.membership?.org_name}</div><div className="mt-1 text-xs text-indigo-200/70">{me.membership?.role} workspace</div></div><button onClick={signOut} className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-indigo-100/75 hover:bg-white/10"><LogOut size={16}/>Sign out</button></div>
    </aside>
    <div className="min-w-0 flex-1 lg:ml-60"><header className="sticky top-0 z-10 flex h-[68px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur md:px-8"><div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 md:flex"><Activity size={15}/> Claims workspace</div><div className="flex items-center gap-3 md:ml-auto"><AiBadge/><button aria-label="Notifications" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><Bell size={18}/></button><div className="grid h-9 w-9 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">{(me.membership?.full_name || me.email || 'A')[0].toUpperCase()}</div><div className="hidden text-xs sm:block"><div className="font-medium">{me.membership?.full_name || me.email}</div><div className="text-slate-500">{me.membership?.org_name}</div></div><button onClick={signOut} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Sign out"><LogOut size={17}/></button></div></header><main className="mx-auto max-w-[1450px] px-4 py-6 md:px-8 md:py-8"><Outlet/></main></div>
  </div>;
}
