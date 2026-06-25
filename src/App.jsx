import { useState } from 'react';
import { AppProvider, useApp } from './lib/AppContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import AnalyzePage from './pages/AnalyzePage.jsx';
import DocumentsPage from './pages/DocumentsPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import AlertsPage from './pages/AlertsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ExpandiumPage from './pages/ExpandiumPage.jsx';

const PAGE_LABELS = {
  dashboard: 'Tableau de bord',
  expandium: 'Expandium',
  analyze: 'Analyse IA',
  documents: 'Documents',
  reports: 'Rapports',
  alerts: 'Alertes',
  'settings-page': 'Paramètres',
};

function Shell() {
  const { user } = useApp();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Pre-login view
  if (!user) return <LoginPage />;

  // Current page label for the topbar breadcrumb
  const pageLabel = PAGE_LABELS[currentPage] || currentPage;

  return (
    <div className="app active">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="main">
        <Topbar pageLabel={pageLabel} onOpenSettings={() => setSettingsOpen(true)} />
        {/* Pages: we render the active one — no offscreen pages kept mounted.
            This keeps the Leaflet map + Chart.js lifecycles simple: each page mounts
            fresh when you navigate to it, matching how a real multi-page React app works. */}
        {currentPage === 'dashboard' && <DashboardPage />}
        {currentPage === 'expandium' && <ExpandiumPage />}
        {currentPage === 'analyze' && <AnalyzePage onOpenSettings={() => setSettingsOpen(true)} />}
        {currentPage === 'documents' && <DocumentsPage />}
        {currentPage === 'reports' && <ReportsPage />}
        {currentPage === 'alerts' && <AlertsPage />}
        {currentPage === 'settings-page' && <SettingsPage />}
      </main>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
