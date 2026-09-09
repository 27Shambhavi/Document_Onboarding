import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme, useAuth } from '../App';
import { api } from '../api/client';
import {
  FileCheck,
  Lock,
  Mail,
  Building2,
  Key,
  ArrowRight,
  Eye,
  EyeOff,
  Sun,
  Moon,
  ShieldAlert,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { isDark, toggleTheme } = useTheme();
  const { login, register } = useAuth();
  const navigate = useNavigate();

  // Mode: 'login' (Client), 'onboard' (Company Registration), 'admin' (Admin Sign In)
  const [mode, setMode] = useState<'login' | 'onboard' | 'admin'>('login');

  const [email, setEmail] = useState('admin@enterprise.com');
  const [password, setPassword] = useState('DocVerify2026!');
  const [showPassword, setShowPassword] = useState(false);

  // Onboarding fields
  const [companyId, setCompanyId] = useState('COMP-88490');
  const [companyName, setCompanyName] = useState('Acme Enterprise Corp');
  const [inviteToken, setInviteToken] = useState('INVITE-DOCVERIFY-9921');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
        navigate('/dashboard', { replace: true });
      } else if (mode === 'onboard') {
        await register({
          company_id: companyId,
          company_name: companyName,
          email,
          password,
          invite_token: inviteToken,
        });
        navigate('/dashboard', { replace: true });
      } else if (mode === 'admin') {
        const adminRes = await api.loginAdmin(email, password);
        localStorage.setItem('docverify_admin_token', adminRes.access_token);
        const adminSession = {
          company_id: 'SUPER_ADMIN',
          company_name: 'Platform Administrator',
          email: email,
          access_token: adminRes.access_token,
          role: adminRes.role || 'SUPER_ADMIN',
        };
        localStorage.setItem('docverify_user', JSON.stringify(adminSession));
        window.location.href = '/admin/dashboard';
      }
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.detail || err?.message || 'Authentication failed. Please check credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  const autofillDemo = () => {
    if (mode === 'admin') {
      setEmail('admin@docverify.ai');
      setPassword('AdminSecretKey2026!');
    } else if (mode === 'onboard') {
      setEmail('onboarding@acme-corp.com');
      setPassword('CompanyPass123!');
      setCompanyId('COMP-77391');
      setCompanyName('Acme Enterprise Corp');
      setInviteToken('INVITE-DOCVERIFY-8891');
    } else {
      setEmail('admin@acme-corp.com');
      setPassword('SecurePass123!');
    }
  };

  return (
    <div className={`min-h-screen flex transition-colors duration-300 ${
      isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      
      {/* LEFT HERO STORYTELLING COLUMN */}
      <div className={`hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12 border-r ${
        isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 text-white border-indigo-800'
      }`}>
        <div className="absolute top-1/4 -left-20 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-80 h-80 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center space-x-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-blue-500 flex items-center justify-center text-white shadow-xl shadow-indigo-500/30">
            <FileCheck className="w-6 h-6" />
          </div>
          <div>
            <span className="font-extrabold text-xl tracking-tight leading-none block">
              DocVerify<span className="text-indigo-400">.ai</span>
            </span>
            <span className="text-xs text-indigo-300 font-medium">Enterprise Document Intelligence</span>
          </div>
        </div>

        <div className="relative z-10 space-y-6 max-w-lg my-auto">
          <h1 className="text-4xl font-extrabold tracking-tight leading-tight">
            Automate Document Extraction with Neural Verification.
          </h1>

          <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-indigo-100'}`}>
            Process government passports, driver IDs, and compliance contracts in milliseconds. Built with multi-stage reasoning engines, custom rule matrix definitions, and dual-view auditing.
          </p>
        </div>
      </div>

      {/* RIGHT FROSTED GLASS FORM CARD */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-6 sm:p-12">
        
        {/* TOP BAR */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-2 lg:hidden">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
              <FileCheck className="w-5 h-5" />
            </div>
            <span className="font-bold text-base">DocVerify.ai</span>
          </div>

          <div className="ml-auto flex items-center space-x-3">
            <button
              onClick={autofillDemo}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                isDark ? 'bg-slate-900 border-slate-800 text-indigo-400 hover:bg-slate-800' : 'bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100'
              }`}
            >
              ⚡ Auto-Fill Demo Credentials
            </button>

            <button
              onClick={toggleTheme}
              className={`p-2 rounded-xl border transition-all ${
                isDark ? 'bg-slate-900 border-slate-800 text-amber-400' : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* CENTERED CARD */}
        <div className="max-w-md w-full mx-auto space-y-6">
          
          <div className="space-y-2 text-center sm:text-left">
            <h2 className="text-3xl font-extrabold tracking-tight">
              {mode === 'login' ? 'Client Sign In' : mode === 'onboard' ? 'Company Onboarding' : 'Admin Portal Login'}
            </h2>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              {mode === 'login'
                ? 'Sign in to access your DocVerify enterprise dashboard.'
                : mode === 'onboard'
                ? 'Enter your single-use invite token to register a company.'
                : 'Authenticate as Platform SuperAdmin to manage approvals and invite tokens.'}
            </p>
          </div>

          {/* 3 MODE SELECTOR TABS */}
          <div className={`p-1 rounded-2xl border flex space-x-1 ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            <button
              type="button"
              onClick={() => { setMode('login'); setErrorMsg(''); }}
              className={`w-1/3 py-2 rounded-xl text-[11px] font-bold transition-all ${
                mode === 'login'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Client Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('onboard'); setErrorMsg(''); }}
              className={`w-1/3 py-2 rounded-xl text-[11px] font-bold transition-all ${
                mode === 'onboard'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Onboard
            </button>
            <button
              type="button"
              onClick={() => { setMode('admin'); setErrorMsg(''); }}
              className={`w-1/3 py-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${
                mode === 'admin'
                  ? 'bg-rose-600 text-white shadow-md'
                  : isDark ? 'text-rose-400 hover:text-rose-300' : 'text-rose-600 hover:text-rose-800'
              }`}
            >
              <ShieldAlert className="w-3 h-3" />
              Admin
            </button>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {/* FORM */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {mode === 'onboard' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-bold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      Company ID
                    </label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={companyId}
                        onChange={(e) => setCompanyId(e.target.value)}
                        placeholder="COMP-9901"
                        className={`w-full pl-9 pr-3 py-2.5 rounded-xl text-xs font-medium border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                          isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`block text-xs font-bold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      Company Name
                    </label>
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Acme Corp"
                      className={`w-full px-3 py-2.5 rounded-xl text-xs font-medium border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                        isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-bold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Single-Use Admin Invite Token
                  </label>
                  <div className="relative">
                    <Key className="w-4 h-4 absolute left-3 top-3 text-indigo-400" />
                    <input
                      type="text"
                      required
                      value={inviteToken}
                      onChange={(e) => setInviteToken(e.target.value)}
                      placeholder="INVITE-DOCVERIFY-XXXX"
                      className={`w-full pl-9 pr-3 py-2.5 rounded-xl text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                        isDark ? 'bg-slate-950 border-slate-800 text-indigo-300' : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className={`block text-xs font-bold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {mode === 'admin' ? 'SuperAdmin Email' : 'Work Email Address'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={mode === 'admin' ? 'admin@docverify.ai' : 'admin@company.com'}
                  className={`w-full pl-9 pr-3 py-2.5 rounded-xl text-xs font-medium border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-xs font-bold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className={`w-full pl-9 pr-10 py-2.5 rounded-xl text-xs font-medium border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                    isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-xl font-extrabold text-xs shadow-lg transition-all flex items-center justify-center space-x-2 group disabled:opacity-50 ${
                mode === 'admin'
                  ? 'bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-rose-600/25'
                  : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-indigo-500/25'
              }`}
            >
              <span>
                {loading
                  ? 'Authenticating...'
                  : mode === 'admin'
                  ? 'Sign In to Admin Portal'
                  : mode === 'login'
                  ? 'Sign In to Dashboard'
                  : 'Complete Onboarding'}
              </span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
          </form>

          <p className={`text-[11px] text-center ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Protected by enterprise end-to-end encryption & AES-256 JWT validation.
          </p>
        </div>

        <div className="text-center text-xs opacity-60">
          © 2026 DocVerify AI System. All rights reserved.
        </div>

      </div>

    </div>
  );
};

export default LoginPage;
