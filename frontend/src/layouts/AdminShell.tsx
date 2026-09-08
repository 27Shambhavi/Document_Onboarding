import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTheme, useAuth } from '../App';
import {
  ShieldAlert,
  Users,
  Key,
  BarChart3,
  Sun,
  Moon,
  ChevronLeft,
  Menu,
  LogOut,
  ArrowLeft,
  Lock,
} from 'lucide-react';

const adminNavigationItems = [
  {
    name: 'Company Approvals & Roster',
    path: '/admin/dashboard',
    icon: Users,
    description: 'Review registered companies & approve access tokens',
  },
  {
    name: 'Invite Token Generator',
    path: '/admin/dashboard#tokens',
    icon: Key,
    description: 'Issue single-use 48-hour registration passkeys',
  },
  {
    name: 'Platform Revenue Analytics',
    path: '/admin/dashboard#analytics',
    icon: BarChart3,
    description: 'System-wide scan throughput & billing overview',
  },
];

export const AdminShell: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className={`flex h-screen overflow-hidden flex-col md:flex-row transition-colors duration-200 ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
    }`}>
      
      {/* MOBILE HEADER */}
      <div className={`md:hidden flex items-center justify-between px-4 py-3 border-b flex-shrink-0 ${
        isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center text-white shadow-md">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg tracking-tight">DocVerify <span className="text-rose-500 text-xs">ADMIN</span></span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className={`p-2 rounded-lg ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* ADMIN SIDEBAR */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 flex flex-col justify-between border-r transition-all duration-300 h-full overflow-y-auto flex-shrink-0 ${
          collapsed ? 'w-20' : 'w-64'
        } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${
          isDark ? 'bg-slate-900/90 backdrop-blur-xl border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        {/* LOGO & BRANDING */}
        <div className="p-4 flex items-center justify-between border-b border-slate-200/10">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 via-red-500 to-amber-500 flex-shrink-0 flex items-center justify-center text-white shadow-lg shadow-rose-500/25">
              <ShieldAlert className="w-6 h-6" />
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="font-bold text-base tracking-tight leading-none flex items-center gap-1">
                  Admin Portal <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 font-bold uppercase">SuperAdmin</span>
                </span>
                <span className={`text-[11px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Platform Governance
                </span>
              </div>
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

        {/* NAVIGATION */}
        <div className="flex-1 px-3 py-4 space-y-2 overflow-y-auto">
          {!collapsed && (
            <p className={`px-3 text-[11px] font-bold tracking-wider uppercase mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              System Controls
            </p>
          )}

          {adminNavigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === '/admin/dashboard';
            return (
              <NavLink
                key={item.name}
                to="/admin/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                  isActive
                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-sm'
                    : isDark
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-rose-400' : 'text-slate-400'}`} />
                {!collapsed && <span className="ml-3 truncate">{item.name}</span>}
              </NavLink>
            );
          })}

          <div className="pt-4 border-t border-slate-200/10">
            <button
              onClick={() => navigate('/dashboard')}
              className={`w-full flex items-center ${collapsed ? 'justify-center' : 'space-x-2'} px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-indigo-400 hover:bg-slate-800'
                  : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
              {!collapsed && <span>Switch to Client Portal</span>}
            </button>
          </div>
        </div>

        {/* FOOTER & LOGOUT */}
        <div className={`p-3 border-t space-y-2 ${isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50'}`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'space-x-3'} p-2 rounded-xl border ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-xs border border-rose-500/30 flex-shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            {!collapsed && (
              <div className="flex-1 truncate">
                <p className="text-xs font-bold truncate leading-tight">Root Administrator</p>
                <p className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>admin@docverify.ai</p>
              </div>
            )}
          </div>

          <button
            onClick={logout}
            className={`w-full flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all`}
          >
            <div className="flex items-center space-x-2">
              <LogOut className="w-4 h-4" />
              {!collapsed && <span>Sign Out Admin</span>}
            </div>
          </button>
        </div>
      </aside>

      {/* MAIN ADMIN CONTENT */}
      <div className="flex-1 h-full overflow-y-auto flex flex-col min-w-0">
        <header className={`sticky top-0 z-30 px-6 py-4 border-b backdrop-blur-xl flex items-center justify-between transition-colors flex-shrink-0 ${
          isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white/80 border-slate-200'
        }`}>
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              Platform Administration Console
              <span className="text-xs px-2.5 py-0.5 rounded-full font-extrabold uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30">
                SuperAdmin
              </span>
            </h1>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Manage company registration approvals, generate single-use invite tokens, and audit platform usage.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-xl border transition-all ${
                isDark ? 'bg-slate-900 border-slate-800 text-amber-400' : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminShell;
