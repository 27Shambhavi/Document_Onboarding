import React, { useEffect, useState } from 'react';
import { useTheme } from '../App';
import { api, type AdminCompany } from '../api/client';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Key,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  Building2,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { isDark } = useTheme();

  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'REJECTED'>('ALL');

  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Action loading state
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchCompanies = async () => {
    try {
      const data = await api.getAdminCompanies();
      setCompanies(data.companies || []);
      setTotalCount(data.total || 0);
    } catch (err) {
      console.error('Failed to load admin companies:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  // Generate Invite Token Handler
  const handleGenerateToken = async () => {
    setTokenLoading(true);
    try {
      const res = await api.generateInviteToken();
      setGeneratedToken(res.token);
      setTokenExpiresAt(res.expires_at);
    } catch (err) {
      console.error('Generate token failed:', err);
    } finally {
      setTokenLoading(false);
    }
  };

  // Approve Company Handler
  const handleApprove = async (companyId: string) => {
    setActionLoadingId(companyId);
    try {
      await api.approveCompany(companyId);
      setCompanies((prev) =>
        prev.map((c) =>
          c.company_id === companyId
            ? { ...c, status: 'ACTIVE', is_active: true, approved_at: new Date().toISOString() }
            : c
        )
      );
    } catch (err) {
      console.error('Approve company failed:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Reject Company Handler
  const handleReject = async (companyId: string) => {
    setActionLoadingId(companyId);
    try {
      await api.rejectCompany(companyId);
      setCompanies((prev) =>
        prev.map((c) =>
          c.company_id === companyId
            ? { ...c, status: 'REJECTED', is_active: false, approved_at: undefined }
            : c
        )
      );
    } catch (err) {
      console.error('Reject company failed:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Copy Token Helper
  const copyToken = () => {
    if (generatedToken) {
      navigator.clipboard.writeText(generatedToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  // Filtered List
  const filteredCompanies = companies.filter((c) => {
    if (filterStatus === 'ALL') return true;
    return c.status === filterStatus;
  });

  const pendingCount = companies.filter((c) => c.status === 'PENDING').length;
  const activeCount = companies.filter((c) => c.status === 'ACTIVE').length;
  const rejectedCount = companies.filter((c) => c.status === 'REJECTED').length;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* KPI METRICS OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className={`p-5 rounded-2xl border ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Registered Companies
            </span>
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold">{totalCount}</span>
            <span className="text-xs text-indigo-400 font-semibold">Total Accounts</span>
          </div>
        </div>

        <div className={`p-5 rounded-2xl border ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Pending Approvals
            </span>
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className={`text-3xl font-extrabold ${pendingCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
              {pendingCount}
            </span>
            <span className="text-xs text-amber-400 font-semibold">Requires Review</span>
          </div>
        </div>

        <div className={`p-5 rounded-2xl border ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Approved Active Accounts
            </span>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-emerald-400">{activeCount}</span>
            <span className="text-xs text-emerald-400 font-semibold">Active JWT Tokens</span>
          </div>
        </div>

        <div className={`p-5 rounded-2xl border ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Rejected Applications
            </span>
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold text-rose-400">{rejectedCount}</span>
            <span className="text-xs text-rose-400 font-semibold">Denied Access</span>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* 1. INVITE TOKEN GENERATOR CARD */}
      {/* ================================================================ */}
      <div id="tokens" className={`p-6 rounded-2xl border ${
        isDark ? 'bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border-slate-800 shadow-xl' : 'bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200 shadow-sm'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Key className="w-3.5 h-3.5" />
              <span>Single-Use Registration Passkey Generator</span>
            </div>

            <h3 className="text-xl font-extrabold tracking-tight">
              Issue One-Time Company Registration Invite Token
            </h3>

            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Generate a unique cryptographic passkey (`INVITE-XXXX...`). Provide this token to new enterprise clients for first-time registration. Tokens burn immediately upon activation.
            </p>
          </div>

          <div className="flex flex-col items-end space-y-3 flex-shrink-0">
            <button
              onClick={handleGenerateToken}
              disabled={tokenLoading}
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center space-x-2 disabled:opacity-50"
            >
              {tokenLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>Generate Single-Use Invite Token</span>
            </button>
          </div>
        </div>

        {/* TOKEN DISPLAY BOX */}
        {generatedToken && (
          <div className="mt-6 pt-4 border-t border-indigo-500/20 animate-in fade-in duration-200">
            <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-4 ${
              isDark ? 'bg-slate-950 border-indigo-500/40 text-indigo-300' : 'bg-white border-indigo-300 text-indigo-950 shadow-md'
            }`}>
              <div className="flex items-center space-x-3 w-full sm:w-auto">
                <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Generated Passkey (Copy for Client)</span>
                  <span className="text-base font-mono font-extrabold tracking-wider">{generatedToken}</span>
                </div>
              </div>

              <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
                <span className="text-[11px] text-emerald-400 font-semibold px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20">
                  {tokenExpiresAt ? `Expires: ${new Date(tokenExpiresAt).toLocaleDateString()} ${new Date(tokenExpiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Valid for 48 Hours'}
                </span>

                <button
                  onClick={copyToken}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 transition-all flex items-center gap-1.5 shadow-sm"
                >
                  {copiedToken ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedToken ? 'Copied to Clipboard!' : 'Copy Token'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* 2. REGISTERED COMPANIES ROSTER TABLE */}
      {/* ================================================================ */}
      <div className={`p-6 rounded-2xl border space-y-6 ${
        isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        
        {/* TABLE HEADER & FILTER TABS */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold tracking-tight">Registered Companies Roster</h3>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Approve or reject company registration requests and manage active JWT credentials
            </p>
          </div>

          {/* STATUS FILTERS */}
          <div className={`p-1 rounded-xl border flex space-x-1 ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            {(['ALL', 'ACTIVE', 'PENDING', 'REJECTED'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  filterStatus === status
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* HIGH-DENSITY ROSTER TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className={`border-b text-[11px] uppercase tracking-wider ${
                isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'
              }`}>
                <th className="py-3 px-4">Company ID</th>
                <th className="py-3 px-4">Company Name</th>
                <th className="py-3 px-4">Admin Email</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Onboarded Date</th>
                <th className="py-3 px-4 text-right">Approval Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading companies roster...
                  </td>
                </tr>
              ) : filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No companies found matching filter status: "{filterStatus}"
                  </td>
                </tr>
              ) : (
                filteredCompanies.map((c) => (
                  <tr key={c.company_id} className={`transition-colors ${
                    isDark ? 'hover:bg-slate-950/60' : 'hover:bg-slate-50'
                  }`}>
                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-400">
                      {c.company_id}
                    </td>

                    <td className="py-3.5 px-4 font-semibold text-sm">
                      {c.company_name}
                    </td>

                    <td className="py-3.5 px-4 font-mono opacity-80">
                      {c.email}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase ${
                        c.status === 'ACTIVE'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : c.status === 'PENDING'
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}>
                        {c.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[11px] opacity-75">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {c.status !== 'ACTIVE' && (
                          <button
                            onClick={() => handleApprove(c.company_id)}
                            disabled={actionLoadingId === c.company_id}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                        )}

                        {c.status !== 'REJECTED' && (
                          <button
                            onClick={() => handleReject(c.company_id)}
                            disabled={actionLoadingId === c.company_id}
                            className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 font-bold text-xs transition-all flex items-center gap-1 disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default AdminDashboard;
