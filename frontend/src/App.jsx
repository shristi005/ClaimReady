import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import NewClaim from './pages/NewClaim';
import ClaimResults from './pages/ClaimResults';
import History from './pages/History';
import Team from './pages/Team';
import Account from './pages/Account';
import QueryDesk from './pages/QueryDesk';
import PaymentTracker from './pages/PaymentTracker';
import PacketBuilder from './pages/PacketBuilder';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/onboarding" element={<ProtectedRoute needOrg={false}><Onboarding /></ProtectedRoute>} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/new" element={<NewClaim />} />
        <Route path="/claims/:id" element={<ClaimResults />} />
        <Route path="/history" element={<History />} />
        <Route path="/queries" element={<QueryDesk />} />
        <Route path="/payments" element={<PaymentTracker />} />
        <Route path="/packets" element={<PacketBuilder />} />
        <Route path="/account" element={<Account />} />
        <Route path="/team" element={<ProtectedRoute adminOnly><Team /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
