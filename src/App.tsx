import { useEffect, useState } from 'react';
import type { View } from './types';

import Sidebar from './components/Sidebar';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import BrowseResources from './pages/BrowseResources';
import ResourceDetails from './pages/ResourceDetails';
import UploadResource from './pages/UploadResource';
import MyUploads from './pages/MyUploads';
import Favorites from './pages/Favorites';
import ResourceRequests from './pages/ResourceRequests';
import Classroom from './pages/Classroom';
import Notifications from './pages/Notifications';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import { useCampusFlow } from './context/CampusFlowContext';

const pathToView = (pathname: string): View | null => {
  if (typeof window === 'undefined') return null;
  const clean = pathname.replace(/^\/+|\/+$/g, '');
  if (!clean || clean === 'landing') return 'landing';
  const validViews: View[] = [
    'login',
    'register',
    'dashboard',
    'browse',
    'resource-details',
    'upload',
    'my-uploads',
    'favorites',
    'requests',
    'classroom',
    'notifications',
    'profile',
    'admin',
  ];
  return validViews.includes(clean as View) ? (clean as View) : null;
};

const viewToPath = (v: View): string => {
  return v === 'landing' ? '/' : `/${v}`;
};

export default function App() {
  const { notifications, notificationLoading, notificationError, markNotifRead, markAllNotifsRead, deleteNotif, isAuthenticated, authLoading, sessionBlocked, currentUser, logout: endSession } = useCampusFlow();
  const [view, setView] = useState<View>(() => {
    if (typeof window !== 'undefined') {
      const initialPathView = pathToView(window.location.pathname);
      if (initialPathView) return initialPathView;
    }
    return isAuthenticated ? 'dashboard' : sessionBlocked ? 'login' : 'landing';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState<string>('r1');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const notifCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const handlePopState = () => {
      const currentPathView = pathToView(window.location.pathname);
      if (currentPathView) {
        setView(currentPathView);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (sessionBlocked) {
      setView('login');
      if (window.location.pathname !== '/login') {
        window.history.replaceState(null, '', '/login');
      }
    } else if (isAuthenticated && ['landing', 'login', 'register'].includes(view)) {
      const directView = pathToView(window.location.pathname);
      if (directView && !['landing', 'login', 'register'].includes(directView)) {
        setView(directView);
      } else {
        setView('dashboard');
        if (window.location.pathname !== '/dashboard') {
          window.history.replaceState(null, '', '/dashboard');
        }
      }
    } else if (!isAuthenticated && !['landing', 'login', 'register'].includes(view)) {
      setView('login');
      if (window.location.pathname !== '/login') {
        window.history.replaceState(null, '', '/login');
      }
    }
  }, [authLoading, isAuthenticated, sessionBlocked, view]);

  const navigate = (v: View) => {
    // Redirect unauthenticated users to login for protected views
    const publicViews: View[] = ['landing', 'login', 'register'];
    if (!isAuthenticated && !publicViews.includes(v)) {
      setView('login');
      if (window.location.pathname !== '/login') {
        window.history.pushState(null, '', '/login');
      }
      return;
    }
    const roleAllowed = currentUser.role === 'admin'
      ? ['dashboard', 'browse', 'notifications', 'profile', 'admin']
      : currentUser.role === 'teacher'
        ? ['dashboard', 'browse', 'upload', 'my-uploads', 'favorites', 'classroom', 'notifications', 'profile']
        : ['dashboard', 'browse', 'upload', 'my-uploads', 'favorites', 'requests', 'classroom', 'notifications', 'profile'];
    if (isAuthenticated && !publicViews.includes(v) && !roleAllowed.includes(v)) {
      setView('dashboard');
      if (window.location.pathname !== '/dashboard') {
        window.history.pushState(null, '', '/dashboard');
      }
      return;
    }
    setView(v);
    const targetPath = viewToPath(v);
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const logout = () => {
    endSession();
    setView('landing');
    if (window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
  };

  const selectResource = (id: string) => {
    setSelectedResourceId(id);
    setView('resource-details');
    if (window.location.pathname !== '/resource-details') {
      window.history.pushState(null, '', '/resource-details');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    navigate('browse');
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#EEF4FF] text-sm font-medium text-slate-500">Restoring your CampusFlow session…</div>;
  }

  // Public pages (no sidebar)
  if (!isAuthenticated || view === 'landing' || view === 'login' || view === 'register') {
    return (
      <div className="min-h-screen">
        {view === 'landing' && <Landing onNavigate={navigate} />}
        {view === 'login' && <Login onNavigate={navigate} onLogin={() => setView('dashboard')} />}
        {view === 'register' && <Register onNavigate={navigate} onLogin={() => setView('dashboard')} />}
        {!isAuthenticated && !['landing', 'login', 'register'].includes(view) && (
          <Login onNavigate={navigate} onLogin={() => setView('dashboard')} />
        )}
      </div>
    );
  }

  // Authenticated layout with sidebar
  const pageProps = {
    onNavigate: navigate,
    onMobileMenuOpen: () => setMobileMenuOpen(true),
    notifCount,
    onSearch: handleSearch,
  };

  return (
    <div className="flex min-h-screen bg-[#EEF4FF]">
      <Sidebar
        currentView={view}
        onNavigate={navigate}
        onLogout={logout}
        notifCount={notifCount}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 overflow-x-hidden">
        {view === 'dashboard' && (
          <Dashboard {...pageProps} onSelectResource={selectResource} />
        )}
        {view === 'browse' && (
          <BrowseResources
            {...pageProps}
            initialSearch={searchQuery}
            onSelectResource={selectResource}
          />
        )}
        {view === 'resource-details' && (
          <ResourceDetails
            {...pageProps}
            resourceId={selectedResourceId}
            onSelectResource={selectResource}
          />
        )}
        {view === 'upload' && <UploadResource {...pageProps} />}
        {view === 'my-uploads' && <MyUploads {...pageProps} onSelectResource={selectResource} />}
        {view === 'favorites' && (
          <Favorites {...pageProps} onSelectResource={selectResource} />
        )}
        {view === 'requests' && <ResourceRequests {...pageProps} />}
        {view === 'classroom' && <Classroom {...pageProps} onSelectResource={selectResource} />}
        {view === 'notifications' && (
          <Notifications
            {...pageProps}
            notificationsList={notifications}
            loading={notificationLoading}
            error={notificationError}
            onMarkRead={markNotifRead}
            onMarkAllRead={markAllNotifsRead}
            onDeleteNotif={deleteNotif}
          />
        )}
        {view === 'profile' && <Profile {...pageProps} />}
        {view === 'admin' && <AdminDashboard {...pageProps} onSelectResource={selectResource} />}
      </div>
    </div>
  );
}
