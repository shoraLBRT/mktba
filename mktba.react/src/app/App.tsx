import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router, useNavigate } from 'react-router-dom';
import { ADMIN_SESSION_EXPIRED_EVENT, startSession, useSession } from '../services/session';
import { MazhabProvider } from '../context/MazhabProvider';
import { CookieConsent } from '../components/CookieConsent';
import { getConsent, initMetrika } from '../analytics/metrika';
import { createQueryClient } from './queryClient';
import { AppRoutes } from './AppRoutes';

const queryClient = createQueryClient();

if (getConsent() === true) {
  initMetrika();
}

void startSession();

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
  // A browser that signed in before waits for its session to be restored, so the first requests
  // already carry the access token (an anonymous navigation tree would hide drafts, for one).
  if (useSession().restoring) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <MazhabProvider>
      <Router>
        <AdminSessionExpirationHandler />
        <CookieConsent />
        <AppRoutes />
      </Router>
      </MazhabProvider>
    </QueryClientProvider>
  );
}

export default App;
