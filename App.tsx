
import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import LoginScreen from './components/LoginScreen';
import AppLauncher from './components/AppLauncher';
import FleetManagement from './components/FleetManagement';
import StockManagement from './components/StockManagement';
import HRAttendance from './components/HRAttendance';
import ADVApp from './components/ADVApp'; 
import KPIPilotApp from './components/KPIPilotApp'; 
import B2BProspectApp from './components/B2BProspectApp';
import TVDashboard from './components/TVDashboard';
import FieldCommandApp from './components/FieldCommandApp';
import FieldControlApp from './components/FieldControlApp';
import UserManagementPanel from './components/UserManagementPanel';
import { User, AppId } from './types';
import { SALES_AGENTS } from './constants';
import { getCloudData } from './services/database';
import { EXCLUDED_AGENTS } from './constants';
import { LogOut, Home, Maximize2 } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [activeApp, setActiveApp] = useState<AppId | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [salesAgents, setSalesAgents] = useState<string[]>(SALES_AGENTS);

  useEffect(() => {
    const session = sessionStorage.getItem('diversifia_session');
    if (session) setUser(JSON.parse(session));
  }, []);

  useEffect(() => {
    const loadUsers = async () => {
      const userData = await getCloudData('users');
      if (userData) {
        const filteredUsers = (userData as User[])
          .filter(u => !EXCLUDED_AGENTS.includes((u.associatedAgentName || '').toLowerCase()))
          .sort((a, b) => (a.associatedAgentName || '').localeCompare(b.associatedAgentName || ''));
        setUsers(filteredUsers);
        
        // Extract unique agent names from users, fall back to SALES_AGENTS if no users
        const dynamicAgents = filteredUsers
          .map(u => u.associatedAgentName)
          .filter((name): name is string => name !== null && name !== undefined && name !== 'Administration')
          .filter((name, index, arr) => arr.indexOf(name) === index)
          .sort((a, b) => a.localeCompare(b));
        
        setSalesAgents(dynamicAgents.length > 0 ? dynamicAgents : SALES_AGENTS);
      }
    };
    loadUsers();
  }, []);

  const handleUsersUpdate = (updatedUsers: User[]) => {
    const filteredUsers = updatedUsers
      .filter(u => !EXCLUDED_AGENTS.includes((u.associatedAgentName || '').toLowerCase()))
      .sort((a, b) => (a.associatedAgentName || '').localeCompare(b.associatedAgentName || ''));
    setUsers(filteredUsers);
    
    // Update dynamic agents list
    const dynamicAgents = filteredUsers
      .map(u => u.associatedAgentName)
      .filter((name): name is string => name !== null && name !== undefined && name !== 'Administration')
      .filter((name, index, arr) => arr.indexOf(name) === index)
      .sort((a, b) => a.localeCompare(b));
    
    setSalesAgents(dynamicAgents.length > 0 ? dynamicAgents : SALES_AGENTS);
  };

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    sessionStorage.setItem('diversifia_session', JSON.stringify(loggedInUser));
  };

  const handleLogout = () => {
    setUser(null);
    setActiveApp(null);
    sessionStorage.removeItem('diversifia_session');
  };

  if (!user) return <LoginScreen onLogin={handleLogin} />;

  // Si TV Dashboard est actif, on affiche en plein écran sans le header habituel pour immersion totale
  if (activeApp === 'tv-dashboard') {
    return (
      <div className="relative">
        <TVDashboard />
        <button 
          onClick={() => setActiveApp(null)} 
          className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all z-50 opacity-0 hover:opacity-100"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    );
  }

  const renderApp = () => {
    switch (activeApp) {
      case 'adv':
        return <ADVApp user={user} salesAgents={salesAgents} />;
      case 'kpi-pilot':
        return <KPIPilotApp user={user} />;
      case 'commissions':
        return <Dashboard currentUser={user} salesAgents={salesAgents} />;
      case 'b2b-prospect':
        return <B2BProspectApp user={user} salesAgents={salesAgents} />;
      case 'fleet':
        return <FleetManagement user={user} />;
      case 'stock':
        return <StockManagement user={user} />;
      case 'hr-attendance':
        return <HRAttendance user={user} />;
      case 'field-command':
        return <FieldCommandApp user={user} salesAgents={salesAgents} />;
      case 'field-control':
        return <FieldControlApp user={user} salesAgents={salesAgents} />;
      case 'users':
        return (
          <div className="max-w-7xl mx-auto px-6 py-12">
             <UserManagementPanel currentAgents={salesAgents} onSaveUsers={handleUsersUpdate} />
          </div>
        );
      default:
        return <AppLauncher user={user} onSelectApp={(id) => setActiveApp(id)} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-['Plus_Jakarta_Sans']">
      <header className="bg-slate-950 text-white shadow-2xl sticky top-0 z-50 print:hidden border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <button onClick={() => setActiveApp(null)} className="flex items-center group">
              <div className="relative">
                <span className="text-2xl font-black tracking-tighter uppercase italic text-white leading-none">DIVERSIFIA</span>
                {/* Icône Signal Radio style image utilisateur */}
                <div className="absolute -top-3 -right-6 scale-75">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="6" cy="18" r="2.5" fill="#ff7900"/>
                    <path d="M12 18C12 14.6863 9.31371 12 6 12" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
                    <path d="M18 18C18 11.3726 12.6274 6 6 6" stroke="#ff7900" stroke-width="2.5" stroke-linecap="round"/>
                  </svg>
                </div>
                <div className="text-[7px] font-black text-[#ff7900] uppercase tracking-[0.4em] mt-1 block text-center">Distributeur Orange</div>
              </div>
            </button>
            <div className="h-8 w-px bg-white/10 hidden sm:block"></div>
            <p className="hidden sm:block text-[9px] font-bold text-slate-500 uppercase tracking-widest">
              {activeApp ? activeApp.toUpperCase().replace('-', ' ') : 'PORTAIL UNIFIÉ'}
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            {activeApp && (
               <button onClick={() => setActiveApp(null)} className="flex items-center space-x-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-xs font-bold uppercase tracking-widest">
                  <Home className="w-4 h-4" />
                  <span className="hidden sm:inline">Portail V1.1.4</span>
               </button>
            )}
            <div className="text-right hidden sm:block border-l border-white/10 pl-4 ml-4">
              <p className="text-xs font-black text-white uppercase tracking-tight">{user.username}</p>
              <p className="text-[9px] text-slate-500 uppercase font-black">{user.role}</p>
            </div>
            <button onClick={handleLogout} className="p-2.5 bg-rose-500/10 hover:bg-rose-50 rounded-xl transition-all text-rose-500 hover:text-white">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow bg-[#f8fafc]">
        {renderApp()}
      </main>

      <footer className="bg-white border-t border-slate-100 mt-auto print:hidden">
        <div className="max-w-7xl mx-auto px-6 py-6 text-center">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-300">© DIVERSIFIA MULTI-APP HUB v2.6</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
