import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, useNavigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import { ADMIN_SESSION_EXPIRED_EVENT } from '../services/authTokenStorage';
import { MazhabProvider } from '../context/MazhabProvider';
import { CookieConsent } from '../components/CookieConsent';
import { getConsent, initMetrika } from '../analytics/metrika';
import { createQueryClient } from './queryClient';
import { AppRoutes } from './AppRoutes';

const queryClient = createQueryClient();

if (getConsent() === true) {
  initMetrika();
}

const AdminSessionExpirationHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleSessionExpired = () => {
      navigate('/admin/login', { replace: true });
    };

    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, [navigate]);

  return null;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MazhabProvider>
      <Router>
        <AdminSessionExpirationHandler />
        <MainLayout>
          <CookieConsent />
          <AppRoutes />
        </MainLayout>
      </Router>
      </MazhabProvider>
    </QueryClientProvider>
  );
}

export default App;
