import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Overview from './pages/Overview';
import LiveMap from './pages/LiveMap';
import Emergencies from './pages/Emergencies';
import Users from './pages/Users';
import Communication from './pages/Communication';
import Settings from './pages/Settings';

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Restoring session…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected />}>
            <Route index element={<Overview />} />
            <Route path="map" element={<LiveMap />} />
            <Route path="emergencies" element={<Emergencies />} />
            <Route path="communication" element={<Communication />} />
            <Route path="users" element={<Users />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
