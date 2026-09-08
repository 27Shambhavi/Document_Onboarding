import React, { useEffect, useState } from 'react';
import { useSearchParams, useOutletContext } from 'react-router-dom';
import { useTheme } from '../App';
import { api, type AdminCompany } from '../api/client';
import type { AdminShellContext, AdminTabType } from '../layouts/AdminShell';
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
  BarChart2,
  TrendingUp,
  Sliders,
  X,
  Lock,
  Coins,
  ShieldCheck,
  FileText,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { isDark } = useTheme();
  const outletContext = useOutletContext<AdminShellContext | undefined>();
  const [searchParams] = useSearchParams();

  // Active Tab handling (synced with URL search params and AdminShell layout)
  const rawTab = (searchParams.get('tab') as AdminTabType) || outletContext?.activeTab || 'roster';
  const activeTab: AdminTabType = ['roster', 'tokens', 'analytics'].includes(rawTab) ? rawTab : 'roster';

  // -------------------------------------------------------------
  // TAB 1: ROSTER & COMPANY APPROVALS STATE
  // -------------------------------------------------------------
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'REJECTED'>('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // -------------------------------------------------------------
  // TAB 2: INVITE & SIGNATURE TOKEN STATE
  // -------------------------------------------------------------
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Contextual Company Signature Add-on Token State (Inside Usage Modal)
  const [generatingCompanySigToken, setGeneratingCompanySigToken] = useState(false);
  const [generatedCompanySigToken, setGeneratedCompanySigToken] = useState<string | null>(null);
  const [copiedCompanySigToken, setCopiedCompanySigToken] = useState(false);
  const [generateSigTokenError, setGenerateSigTokenError] = useState<string | null>(null);

  // -------------------------------------------------------------
  // TAB 3: PLATFORM ANALYTICS & PRICING ENGINE STATE
  // -------------------------------------------------------------
  const [analyticsOverview, setAnalyticsOverview] = useState<any | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Global Pricing Form State
  const [baseRatePerPage, setBaseRatePerPage] = useState<number>(0.50);
  const [signatureCheckRate, setSignatureCheckRate] = useState<number>(1.00);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingSaveSuccess, setPricingSaveSuccess] = useState(false);
  const [pricingSaveError, setPricingSaveError] = useState<string | null>(null);

  // -------------------------------------------------------------
  // DRILL-DOWN MODAL STATE (Company Usage Analytics)
  // -------------------------------------------------------------
  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [companyUsageData, setCompanyUsageData] = useState<any | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  // -------------------------------------------------------------
  // DATA FETCHING HANDLERS
  // -------------------------------------------------------------
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

  const fetchPricingAndAnalytics = async () => {
    setAnalyticsLoading(true);
    setPricingLoading(true);
    try {
      const [pricingData, overviewData] = await Promise.all([
        api.getBillingPricing().catch(() => null),
        api.getAdminOverview('monthly').catch(() => null),
      ]);

      if (pricingData) {
        setBaseRatePerPage(Number(pricingData.price_per_page ?? 0.50));
        setSignatureCheckRate(Number(pricingData.price_per_signature_check ?? 1.00));
      } else if (overviewData?.active_pricing) {
        setBaseRatePerPage(Number(overviewData.active_pricing.price_per_page ?? 0.50));
        setSignatureCheckRate(Number(overviewData.active_pricing.price_per_signature_check ?? 1.00));
      }

      if (overviewData) {
        setAnalyticsOverview(overviewData);
      }
    } catch (err) {
      console.error('Failed to fetch pricing and analytics:', err);
    } finally {
      setAnalyticsLoading(false);
      setPricingLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
    fetchPricingAndAnalytics();
  }, []);

  // -------------------------------------------------------------
  // ROSTER ACTIONS
  // -------------------------------------------------------------
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

  // Open Company Usage Drill-Down Modal
  const handleOpenUsageModal = async (companyId: string) => {
    setSelectedCompanyId(companyId);
    setUsageModalOpen(true);
    setUsageLoading(true);
    setUsageError(null);
    setGeneratedCompanySigToken(null);
    setCopiedCompanySigToken(false);
    setGenerateSigTokenError(null);
    try {
      const data = await api.getCompanyUsageAdmin(companyId);
      setCompanyUsageData(data);
      if (data?.signature_unlock_token) {
        setGeneratedCompanySigToken(data.signature_unlock_token);
      }
    } catch (err: any) {
      console.error('Failed to fetch company usage:', err);
      setUsageError(err?.response?.data?.detail || 'Failed to load usage analytics for this company.');
    } finally {
      setUsageLoading(false);
    }
  };

  const handleCloseUsageModal = () => {
    setUsageModalOpen(false);
    setSelectedCompanyId(null);
    setCompanyUsageData(null);
    setUsageError(null);
    setGeneratedCompanySigToken(null);
    setCopiedCompanySigToken(false);
    setGenerateSigTokenError(null);
  };

  // -------------------------------------------------------------
  // TOKEN ACTIONS
  // -------------------------------------------------------------
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

  const copyInviteToken = () => {
    if (generatedToken) {
      navigator.clipboard.writeText(generatedToken);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const handleGenerateCompanySignatureToken = async () => {
    if (!selectedCompanyId) return;
    setGeneratingCompanySigToken(true);
    setGenerateSigTokenError(null);
    try {
      const res = await api.generateCompanySignatureToken(selectedCompanyId);
      if (res?.signature_unlock_token) {
        setGeneratedCompanySigToken(res.signature_unlock_token);
        setCompanyUsageData((prev: any) =>
          prev ? { ...prev, signature_unlock_token: res.signature_unlock_token } : prev
        );
      }
    } catch (err: any) {
      console.error('Failed to generate company signature token:', err);
      setGenerateSigTokenError(err?.response?.data?.detail || 'Failed to generate single-use token.');
    } finally {
      setGeneratingCompanySigToken(false);
    }
  };

  const handleCopyCompanySigToken = (tokenToCopy: string) => {
    if (tokenToCopy) {
      navigator.clipboard.writeText(tokenToCopy);
      setCopiedCompanySigToken(true);
      setTimeout(() => setCopiedCompanySigToken(false), 2000);
    }
  };

  // -------------------------------------------------------------
  // PRICING ACTIONS (Save Global Rates)
  // -------------------------------------------------------------
  const handleSavePricing = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (baseRatePerPage < 0 || signatureCheckRate < 0) {
      setPricingSaveError('Rates cannot be negative numbers.');
      return;
    }

    setPricingSaving(true);
    setPricingSaveError(null);
    try {
      const res = await api.updateBillingPricing(baseRatePerPage, signatureCheckRate);
      setPricingSaveSuccess(true);
      if (res?.pricing) {
        setBaseRatePerPage(res.pricing.price_per_page);
        setSignatureCheckRate(res.pricing.price_per_signature_check);
      }
      setTimeout(() => setPricingSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error('Save pricing rates error:', err);
      setPricingSaveError(err?.response?.data?.detail || 'Failed to update pricing rates.');
    } finally {
      setPricingSaving(false);
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
      
      {/* =================================================================== */}
      {/* TAB 1: COMPANY APPROVALS & ROSTER VIEW                             */}
      {/* =================================================================== */}
      {activeTab === 'roster' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          
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

          {/* REGISTERED COMPANIES ROSTER TABLE */}
          <div className={`p-6 rounded-2xl border space-y-6 ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold tracking-tight">Registered Companies Roster</h3>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Approve/reject access, inspect independent scan consumption, and view usage drill-downs.
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
                        ? 'bg-rose-600 text-white shadow-sm'
                        : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {/* TABLE */}
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
                    <th className="py-3 px-4 text-right">Actions & Governance</th>
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
                        <td className="py-3.5 px-4 font-mono font-bold text-rose-400">
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
                            
                            {/* TASK 3: VIEW USAGE & ANALYTICS BUTTON */}
                            {c.status === 'ACTIVE' && (
                              <button
                                onClick={() => handleOpenUsageModal(c.company_id)}
                                className={`px-3 py-1.5 rounded-lg border font-bold text-xs transition-all flex items-center gap-1.5 ${
                                  isDark
                                    ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-300 hover:bg-indigo-600 hover:text-white'
                                    : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white'
                                }`}
                                title="View real-time scans, pages, and incurred revenue drill-down"
                              >
                                <BarChart2 className="w-3.5 h-3.5" />
                                <span>Usage & Analytics</span>
                              </button>
                            )}

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
      )}

      {/* =================================================================== */}
      {/* TAB 2: INVITE & SIGNATURE TOKEN GENERATION VIEW                     */}
      {/* =================================================================== */}
      {activeTab === 'tokens' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          
          {/* 1. REGISTRATION INVITE TOKEN GENERATOR */}
          <div className={`p-6 rounded-2xl border ${
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

            {/* DISPLAY BOX */}
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
                      onClick={copyInviteToken}
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

        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: PLATFORM REVENUE ANALYTICS & GLOBAL PRICING ENGINE           */}
      {/* =================================================================== */}
      {activeTab === 'analytics' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          
          {/* HEADER & REFRESH BAR */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold tracking-tight">Platform Financials & System Throughput</h3>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Aggregated scan volumes, revenue metrics, and global pricing controls.
              </p>
            </div>
            <button
              onClick={fetchPricingAndAnalytics}
              disabled={analyticsLoading}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1.5 self-start sm:self-auto ${
                isDark ? 'border-slate-800 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${analyticsLoading ? 'animate-spin' : ''}`} />
              <span>{analyticsLoading ? 'Syncing...' : 'Sync Telemetry'}</span>
            </button>
          </div>

          {/* PLATFORM KPI METRICS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className={`p-5 rounded-2xl border ${
              isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Platform Total Revenue
                </span>
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <Coins className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-emerald-400">
                  ₹{analyticsOverview?.platform_totals?.total_revenue_generated?.toFixed(2) ?? '0.00'}
                </span>
                <span className="text-xs text-emerald-400 font-semibold">Live INR Volume</span>
              </div>
            </div>

            <div className={`p-5 rounded-2xl border ${
              isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Total Requests Processed
                </span>
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                  <FileText className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-indigo-400">
                  {analyticsOverview?.platform_totals?.total_requests_processed ?? 0}
                </span>
                <span className="text-xs text-indigo-400 font-semibold">Audit Pipelines</span>
              </div>
            </div>

            <div className={`p-5 rounded-2xl border ${
              isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Total Pages Processed
                </span>
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-blue-400">
                  {analyticsOverview?.platform_totals?.total_pages_processed ?? 0}
                </span>
                <span className="text-xs text-blue-400 font-semibold">Pages Ingested</span>
              </div>
            </div>

            <div className={`p-5 rounded-2xl border ${
              isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Signatures Verified
                </span>
                <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-rose-400">
                  {analyticsOverview?.platform_totals?.total_signatures_scanned ?? 0}
                </span>
                <span className="text-xs text-rose-400 font-semibold">Add-on Checks</span>
              </div>
            </div>
          </div>

          {/* TASK 2: GLOBAL PRICING CONFIGURATION ENGINE CARD */}
          <div className={`p-6 rounded-2xl border ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200/10">
              <div className="space-y-1">
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Platform Governance & Currency (INR ₹)</span>
                </div>
                <h3 className="text-lg font-bold tracking-tight">Global Pricing Configuration</h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Dynamically adjust system-wide billing unit economics. Updates apply instantly to all client invoices and audit cost counters.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs px-3 py-1 rounded-lg font-mono font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                  Currency: INR (₹)
                </span>
              </div>
            </div>

            <form onSubmit={handleSavePricing} className="mt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* FIELD 1: BASE RATE PER PAGE */}
                <div className={`p-4 rounded-xl border space-y-2 ${
                  isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                    Base Rate Per Page (₹)
                  </label>
                  <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Standard document onboarding & OCR blueprint extraction charge per page.
                  </p>
                  <div className="relative mt-2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-sm text-slate-400">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={baseRatePerPage}
                      onChange={(e) => setBaseRatePerPage(parseFloat(e.target.value) || 0)}
                      className={`w-full pl-8 pr-4 py-2.5 rounded-lg text-sm font-bold font-mono border transition-all ${
                        isDark ? 'bg-slate-900 border-slate-700 text-white focus:border-indigo-500' : 'bg-white border-slate-300 text-slate-900 focus:border-indigo-600'
                      }`}
                      placeholder="0.50"
                      required
                    />
                  </div>
                </div>

                {/* FIELD 2: SIGNATURE & STAMP VERIFICATION ADD-ON */}
                <div className={`p-4 rounded-xl border space-y-2 ${
                  isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                    Signature & Stamp Verification Add-on (₹)
                  </label>
                  <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Premium computer vision add-on charge per validated signature or stamp detection.
                  </p>
                  <div className="relative mt-2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-sm text-slate-400">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={signatureCheckRate}
                      onChange={(e) => setSignatureCheckRate(parseFloat(e.target.value) || 0)}
                      className={`w-full pl-8 pr-4 py-2.5 rounded-lg text-sm font-bold font-mono border transition-all ${
                        isDark ? 'bg-slate-900 border-slate-700 text-white focus:border-indigo-500' : 'bg-white border-slate-300 text-slate-900 focus:border-indigo-600'
                      }`}
                      placeholder="1.00"
                      required
                    />
                  </div>
                </div>

              </div>

              {/* FEEDBACK NOTICES */}
              {pricingSaveSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>Global pricing rates saved successfully! All client invoices and live audit calculators now use these exact rates.</span>
                </div>
              )}

              {pricingSaveError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
                  <XCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{pricingSaveError}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={fetchPricingAndAnalytics}
                  disabled={pricingLoading || pricingSaving}
                  className={`px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    isDark ? 'border-slate-800 text-slate-400 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Reset to Current
                </button>

                <button
                  type="submit"
                  disabled={pricingSaving}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/30 transition-all flex items-center space-x-2 disabled:opacity-50"
                >
                  {pricingSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Save Pricing Rates</span>
                </button>
              </div>
            </form>
          </div>

          {/* PER-COMPANY USAGE BREAKDOWN TABLE */}
          <div className={`p-6 rounded-2xl border space-y-4 ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold tracking-tight">Per-Company Usage & Revenue Breakdown</h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  System-wide consumption records per enterprise tenant.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className={`border-b text-[11px] uppercase tracking-wider ${
                    isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'
                  }`}>
                    <th className="py-3 px-4">Company ID</th>
                    <th className="py-3 px-4">Company Name</th>
                    <th className="py-3 px-4">Requests</th>
                    <th className="py-3 px-4">Total Pages</th>
                    <th className="py-3 px-4">Signatures</th>
                    <th className="py-3 px-4 text-right">Incurred Revenue (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-medium">
                  {analyticsOverview?.companies_breakdown?.length > 0 ? (
                    analyticsOverview.companies_breakdown.map((row: any) => (
                      <tr key={row.company_id} className={`transition-colors ${
                        isDark ? 'hover:bg-slate-950/60' : 'hover:bg-slate-50'
                      }`}>
                        <td className="py-3 px-4 font-mono font-bold text-indigo-400">{row.company_id}</td>
                        <td className="py-3 px-4 font-semibold">{row.company_name}</td>
                        <td className="py-3 px-4 font-mono">{row.requests}</td>
                        <td className="py-3 px-4 font-mono">{row.pages}</td>
                        <td className="py-3 px-4 font-mono">{row.signatures}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                          ₹{row.amount_due?.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        No transactions recorded for the current billing cycle.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* =================================================================== */}
      {/* TASK 3: COMPANY USAGE ANALYTICS DRILL-DOWN MODAL                   */}
      {/* =================================================================== */}
      {usageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh] ${
            isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            
            {/* MODAL HEADER */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50'
            }`}>
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
                  <BarChart2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight flex items-center gap-2">
                    Company Usage Drill-Down
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">
                      {selectedCompanyId}
                    </span>
                  </h3>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {companyUsageData?.company_name || 'Loading company records...'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleCloseUsageModal}
                className={`p-2 rounded-xl transition-all ${
                  isDark ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* MODAL BODY */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {usageLoading ? (
                <div className="py-12 text-center text-slate-400 space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-rose-500" />
                  <p className="text-xs font-semibold">Aggregating PostgreSQL scan records for {selectedCompanyId}...</p>
                </div>
              ) : usageError ? (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  {usageError}
                </div>
              ) : companyUsageData ? (
                <>
                  {/* KPI AGGREGATION CARDS */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className={`p-4 rounded-xl border ${
                      isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Total Scans Run
                      </span>
                      <span className="text-2xl font-extrabold mt-1 block text-indigo-400">
                        {companyUsageData.total_scans ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-400">Completed Audits</span>
                    </div>

                    <div className={`p-4 rounded-xl border ${
                      isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Total Pages Processed
                      </span>
                      <span className="text-2xl font-extrabold mt-1 block text-blue-400">
                        {companyUsageData.total_pages ?? 0}
                      </span>
                      <span className="text-[10px] text-slate-400">Document Pages</span>
                    </div>

                    <div className={`p-4 rounded-xl border ${
                      isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Total Revenue (INR)
                      </span>
                      <span className="text-2xl font-extrabold mt-1 block text-emerald-400">
                        ₹{companyUsageData.total_revenue_inr?.toFixed(2) ?? '0.00'}
                      </span>
                      <span className="text-[10px] text-emerald-400 font-semibold">Billed Consumption</span>
                    </div>
                  </div>

                  {/* COMPANY STATUS BADGES */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Status: {companyUsageData.company_status}
                    </span>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
                      companyUsageData.signature_unlocked
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                      Signature Add-on: {companyUsageData.signature_unlocked ? 'UNLOCKED' : 'LOCKED'}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full font-mono text-slate-400 border border-slate-700/50">
                      Email: {companyUsageData.email}
                    </span>
                  </div>

                  {/* SIGNATURE ADD-ON STATUS & 1-TIME UNLOCK GENERATOR */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Signature Add-on Status
                    </h4>

                    {companyUsageData.signature_unlocked ? (
                      <div className={`p-4 rounded-xl border flex items-center justify-between ${
                        isDark ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'
                      }`}>
                        <div className="flex items-center space-x-3">
                          <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <ShieldCheck className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                                Neural Verification Add-on
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>Premium Unlocked</span>
                              </span>
                            </div>
                            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              Signature & Stamp Verification is permanently activated for this tenant.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={`p-5 rounded-xl border space-y-4 ${
                        isDark ? 'bg-slate-950/70 border-rose-500/30' : 'bg-rose-50/60 border-rose-200'
                      }`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center space-x-3">
                            <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
                              <Lock className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                                  Neural Verification Add-on
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                  Locked
                                </span>
                              </div>
                              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                Generate a single-use, company-specific token to grant this organization access to neural signature checks.
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={handleGenerateCompanySignatureToken}
                            disabled={generatingCompanySigToken}
                            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all flex items-center space-x-2 self-start sm:self-auto disabled:opacity-50 shadow-md shadow-rose-600/30"
                          >
                            <Key className={`w-3.5 h-3.5 ${generatingCompanySigToken ? 'animate-spin' : ''}`} />
                            <span>{generatingCompanySigToken ? 'Generating...' : 'Generate 1-Time Unlock Token'}</span>
                          </button>
                        </div>

                        {generateSigTokenError && (
                          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
                            <XCircle className="w-4 h-4 flex-shrink-0" />
                            <span>{generateSigTokenError}</span>
                          </div>
                        )}

                        {/* GENERATED TOKEN DISPLAY BOX */}
                        {(generatedCompanySigToken || companyUsageData.signature_unlock_token) && (
                          <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-200 ${
                            isDark ? 'bg-slate-900 border-amber-500/40 text-amber-300' : 'bg-white border-amber-300 text-amber-900 shadow-sm'
                          }`}>
                            <div className="space-y-1">
                              <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block">
                                Single-Use Unlock Token (Burns after 1st use)
                              </span>
                              <span className="text-sm font-mono font-extrabold tracking-wider text-amber-400">
                                {generatedCompanySigToken || companyUsageData.signature_unlock_token}
                              </span>
                            </div>

                            <button
                              onClick={() => handleCopyCompanySigToken(generatedCompanySigToken || companyUsageData.signature_unlock_token)}
                              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all flex items-center space-x-1.5 shadow-sm"
                            >
                              {copiedCompanySigToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedCompanySigToken ? 'Copied!' : 'Copy Token'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* RECENT SCANS LIST */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Recent Scans History (Latest 10)
                    </h4>

                    <div className="overflow-x-auto rounded-xl border border-slate-800/60">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className={`border-b text-[10px] uppercase tracking-wider ${
                            isDark ? 'border-slate-800 bg-slate-950/40 text-slate-400' : 'border-slate-200 bg-slate-100 text-slate-600'
                          }`}>
                            <th className="py-2.5 px-3">Scan ID</th>
                            <th className="py-2.5 px-3">Filename</th>
                            <th className="py-2.5 px-3 text-center">Pages</th>
                            <th className="py-2.5 px-3">Cost (₹)</th>
                            <th className="py-2.5 px-3 text-right">Scanned Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40 font-medium">
                          {companyUsageData.recent_scans?.length > 0 ? (
                            companyUsageData.recent_scans.map((s: any) => (
                              <tr key={s.id} className={isDark ? 'hover:bg-slate-950/40' : 'hover:bg-slate-50'}>
                                <td className="py-2 px-3 font-mono font-bold text-rose-400">#{s.id}</td>
                                <td className="py-2 px-3 font-semibold truncate max-w-[200px]" title={s.filename}>
                                  {s.filename}
                                </td>
                                <td className="py-2 px-3 text-center font-mono">{s.pages_count}</td>
                                <td className="py-2 px-3 font-mono text-emerald-400">₹{s.cost_inr?.toFixed(2)}</td>
                                <td className="py-2 px-3 text-right font-mono text-[11px] opacity-75">
                                  {s.created_at ? new Date(s.created_at).toLocaleString() : 'N/A'}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="py-6 text-center text-slate-400 text-xs">
                                No scan history found in database for this company.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* MODAL FOOTER */}
            <div className={`px-6 py-3.5 border-t flex justify-end ${
              isDark ? 'border-slate-800 bg-slate-950/50' : 'border-slate-200 bg-slate-50'
            }`}>
              <button
                onClick={handleCloseUsageModal}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-all"
              >
                Close Drill-Down
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;
