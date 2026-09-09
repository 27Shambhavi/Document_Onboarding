import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTheme, useAuth } from '../App';
import {
  LayoutDashboard,
  Sliders,
  ShieldCheck,
  CreditCard,
  Sun,
  Moon,
  ChevronLeft,
  Menu,
  FileCheck,
  Building2,
  LogOut,
  UserCheck,
  Bot,
} from 'lucide-react';

const navigationItems = [
  {
    name: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
    description: 'System metrics, document throughput, & engine health',
  },
  {
    name: 'Intelligence Config',
    path: '/config',
    icon: Sliders,
    description: 'OCR Schema Blueprints & Compliance Policy Guidelines',
  },
  {
    name: 'Audit Engine',
    path: '/audit',
    icon: ShieldCheck,
    badge: 'Core',
    description: 'Candidate OCR extraction & Guideline evaluation pipeline',
  },
  {
    name: 'AI Candidate Match',
    path: '/hr-ranking',
    icon: UserCheck,
    badge: 'XAI',
    description: 'Explainable AI resume ranking & JD requirement matching',
  },
  {
    name: 'Assistant',
    path: '/rag',
    icon: Bot,
    badge: 'AI',
    description: 'Document intelligence Q&A with compliance audit history',
  },
  {
    name: 'Billing & Usage',
    path: '/billing',
    icon: CreditCard,
    description: 'Scan metrics, per-page rates, & add-on subscriptions',
  },
];

export const DashboardLayout: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeNavItem =
    navigationItems.find(
      (item) => item.path === location.pathname || (item.path === '/rag' && location.pathname === '/chatbot')
    ) || navigationItems[0];

  return (
    <div className={`flex h-screen overflow-hidden flex-col md:flex-row transition-colors duration-200 ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* MOBILE HEADER BAR */}
      <div className={`md:hidden flex items-center justify-between px-4 py-3 border-b flex-shrink-0 ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <FileCheck className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg tracking-tight">DocVerify<span className="text-indigo-500">.ai</span></span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className={`p-2 rounded-lg ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* SIDEBAR NAVIGATION */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 flex flex-col justify-between border-r transition-all duration-300 h-full overflow-y-auto flex-shrink-0 ${
          collapsed ? 'w-20' : 'w-64'
        } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${
          isDark ? 'bg-slate-900/80 backdrop-blur-xl border-slate-800/80' : 'bg-white border-slate-200'
        }`}
      >
        {/* LOGO & BRANDING */}
        <div className="p-4 flex items-center justify-between border-b border-slate-200/10">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-blue-500 flex-shrink-0 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
              <FileCheck className="w-6 h-6" />
            </div>
            {!collapsed && (
              <span className="font-bold text-lg tracking-tight leading-none">
                DocVerify
              </span>
            )}
          </div>
          
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`hidden md:flex p-1.5 rounded-lg border transition-colors ${
              isDark
                ? 'border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white'
                : 'border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-900'
            }`}
          >
            <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* NAVIGATION LINKS */}
        <div className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {!collapsed && (
            <p className={`px-3 text-[11px] font-bold tracking-wider uppercase mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Enterprise Suite
            </p>
          )}

          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative ${
                    isActive
                      ? isDark
                        ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm shadow-indigo-500/10'
                        : 'bg-indigo-50 text-indigo-600 border border-indigo-200/80 shadow-sm'
                      : isDark
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 border border-transparent'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-indigo-500' : 'text-slate-400 group-hover:text-slate-300'}`} />
                    {!collapsed && <span className="ml-3 truncate">{item.name}</span>}
                    {!collapsed && item.badge && (
                      <span className="ml-auto px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* FOOTER USER / ORG BADGE & SIGN OUT */}
        <div className={`p-3 border-t space-y-2 ${isDark ? 'border-slate-800/80 bg-slate-900/40' : 'border-slate-200 bg-slate-50'}`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'space-x-3'} p-2 rounded-xl border ${
            isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-500 flex items-center justify-center font-bold text-xs border border-indigo-500/30 flex-shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            {!collapsed && (
              <div className="flex-1 truncate">
                <p className="text-xs font-semibold truncate leading-tight">{user?.company_name || 'Acme Enterprise'}</p>
                <p className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>ID: {user?.company_id || 'COMP-77391'}</p>
              </div>
            )}
          </div>

          <button
            onClick={logout}
            className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              isDark ? 'text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20' : 'text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200'
            }`}
            title="Sign out of enterprise account"
          >
            <div className="flex items-center space-x-2">
              <LogOut className="w-4 h-4" />
              {!collapsed && <span>Sign Out</span>}
            </div>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT CONTAINER */}
      <div className="flex-1 h-full overflow-y-auto flex flex-col min-w-0">
        {/* HEADER BAR */}
        <header className={`sticky top-0 z-30 px-6 py-4 border-b backdrop-blur-xl flex items-center justify-between transition-colors flex-shrink-0 ${
          isDark ? 'bg-slate-950/80 border-slate-800/80' : 'bg-white/80 border-slate-200'
        }`}>
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              {activeNavItem.name}
              <span className={`hidden sm:inline-flex text-xs px-2.5 py-0.5 rounded-full font-medium border ${
                isDark ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}>
                Production
              </span>
            </h1>
            <p className={`text-xs mt-0.5 hidden sm:block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {activeNavItem.description}
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {/* THEME TOGGLE SWITCH */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle dark mode"
              className={`p-2 rounded-xl border transition-all flex items-center gap-2 ${
                isDark
                  ? 'bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800 hover:border-slate-700'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {isDark ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-semibold text-slate-300 hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-semibold text-slate-700 hidden sm:inline">Dark</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* PAGE CONTENT OUTLET */}
        <main className="flex-1 p-4 md:p-8 pb-32">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
