import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  LayoutDashboard,
  Building2,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  Shield,
  FileCode,
  UploadCloud,
  Sun,
  Moon,
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, role, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const adminNavigation = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Companies & Tokens', href: '/admin/companies', icon: Building2 },
    { name: 'Settings', href: '/admin/settings', icon: Settings },
  ];

  const companyNavigation = [
    { name: 'Dashboard', href: '/company/dashboard', icon: LayoutDashboard },
    { name: 'Documents', href: '/company/documents', icon: FileText },
    { name: 'Upload Documents', href: '/company/upload', icon: UploadCloud },
    { name: 'Guideline Checks', href: '/company/guidelines', icon: FileCode },
    { name: 'Settings & Activity', href: '/company/settings', icon: Settings },
  ];

  const navigation = role === 'admin' ? adminNavigation : companyNavigation;

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      <header className="sticky top-0 z-40 grid h-[72px] grid-cols-[1fr_auto] items-center border-b border-border bg-card/95 backdrop-blur-xl transition-colors sm:grid-cols-[16rem_1fr]">
        <div className="flex h-full items-center border-border px-4 sm:border-r sm:px-6">
            <Link to={role === 'admin' ? '/admin/dashboard' : '/company/dashboard'} className="flex min-w-0 flex-shrink-0 items-center gap-3">
              <span className="app-icon h-9 w-9">
                <Shield className="h-5 w-5" />
              </span>
              <span className="truncate text-lg font-bold tracking-tight">
                DocVerify
              </span>
            </Link>
        </div>
          
        <div className="flex min-w-0 items-center justify-end gap-3 px-4 sm:px-6 lg:px-8">
          <div className="hidden min-w-0 items-center gap-3 sm:flex">
            <button
              onClick={toggleTheme}
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-primary"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            <div className="flex min-w-0 max-w-[320px] items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground xl:max-w-[420px]">
              <User className="h-3.5 w-3.5 text-primary" />
              <span className="truncate font-semibold">
                {user?.name || user?.email || (role === 'admin' ? 'Administrator' : 'Company Client')}
              </span>
              <span className="shrink-0 rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-primary">
                {role}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground transition hover:bg-muted hover:text-red-500"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>

          <div className="flex items-center gap-3 sm:hidden">
            <button
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
            >
              {theme === 'light' ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
            </button>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              {sidebarOpen ? <X className="h-5.5 w-5.5" /> : <Menu className="h-5.5 w-5.5" />}
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 flex flex-1">
        <aside
          className={`fixed inset-y-0 left-0 z-30 w-64 border-r border-border bg-card pt-[72px] transition-transform duration-300 ease-in-out sm:sticky sm:top-[72px] sm:h-[calc(100vh-72px)] sm:translate-x-0 sm:pt-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-full flex-col justify-between px-3 pt-8 pb-5">
            <nav className="space-y-2">
              {navigation.map((item) => {
                const isActive = location.pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/15'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <item.icon
                      className={`h-4.5 w-4.5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            <div className="sm:hidden border-t border-border pt-5 mt-5 space-y-3">
              <div className="flex items-center gap-2.5 px-3 py-1.5">
                <User className="h-4.5 w-4.5 text-muted-foreground" />
                <div>
                  <p className="text-xs font-semibold truncate text-foreground">
                    {user?.name || user?.email}
                  </p>
                  <p className="text-[10px] text-muted-foreground capitalize">{role}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-semibold text-red-500 transition hover:bg-red-50 dark:hover:bg-red-950/20"
              >
                <LogOut className="h-4.5 w-4.5" />
                Sign Out
              </button>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <button
            aria-label="Close navigation"
            className="fixed inset-0 z-20 bg-background/70 backdrop-blur-sm sm:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="min-w-0 flex-1 overflow-y-auto bg-background p-4 transition-colors duration-300 sm:p-6 lg:p-8">
          <div className="w-full font-sans text-foreground">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
