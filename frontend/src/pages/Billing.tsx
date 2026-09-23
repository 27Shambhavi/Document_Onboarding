import React, { useEffect, useState } from 'react';
import { useTheme, useAuth } from '../App';
import { api } from '../api/client';
import { PageHeaderActions } from '../components/PageHeaderActions';
import {
  IndianRupee,
  FileCheck,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  Receipt,
  AlertTriangle,
  RefreshCw,
  Zap,
  Settings,
  Lock,
  Key,
  X,
} from 'lucide-react';

export const Billing: React.FC = () => {
  const { isDark } = useTheme();
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';

  // Dynamic real data state
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);

  const [companyId, setCompanyId] = useState<string>(user?.company_id || '');
  const [companyName, setCompanyName] = useState<string>(user?.company_name || '');
  const [totalPagesScanned, setTotalPagesScanned] = useState<number>(0);
  const [ratePerPage, setRatePerPage] = useState<number>(0.50);
  const [ratePerSignature, setRatePerSignature] = useState<number>(1.00);
  const [totalEstimatedBill, setTotalEstimatedBill] = useState<number>(0);
  const [signatureAddonActive, setSignatureAddonActive] = useState<boolean>(false);
  const [signatureUnlocked, setSignatureUnlocked] = useState<boolean>(false);
  const [totalSignaturesScanned, setTotalSignaturesScanned] = useState<number>(0);

  // Rate modification state (admin only)
  const [editingRate, setEditingRate] = useState<number>(0.50);
  const [editingSigRate, setEditingSigRate] = useState<number>(1.00);
  const [rateUpdating, setRateUpdating] = useState(false);
  const [savedRateToast, setSavedRateToast] = useState(false);

  // Task 3: Unlock Signature Modal State
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [secretTokenInput, setSecretTokenInput] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockSuccessToast, setUnlockSuccessToast] = useState(false);

  const handleUnlockSignature = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!secretTokenInput.trim()) {
      setUnlockError('Please enter your single-use unlock token.');
      return;
    }
    setUnlockLoading(true);
    setUnlockError(null);
    try {
      const res: any = await api.unlockSignature(secretTokenInput.trim());
      if (res?.signature_unlocked) {
        setSignatureUnlocked(true);
        setShowUnlockModal(false);
        setSecretTokenInput('');
        setUnlockSuccessToast(true);
        setTimeout(() => setUnlockSuccessToast(false), 4000);
      } else {
        setUnlockError('Unlock failed. Please verify your token.');
      }
    } catch (err: any) {
      console.error('Unlock signature error:', err);
      const msg = err?.response?.data?.detail || err?.message || 'Invalid or expired signature unlock token.';
      setUnlockError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setUnlockLoading(false);
    }
  };

  const fetchBillingData = async () => {
    setLoading(true);
    setErrorState(null);
    try {
      const data: any = await api.getBillingSummary('monthly');

      const pages = Number(data?.metrics?.total_pages_scanned ?? data?.total_pages_scanned ?? 0);
      const ratePage = Number(data?.billing_summary?.rate_per_page ?? data?.price_per_page ?? 0.50);
      const rateSig = Number(data?.billing_summary?.rate_per_signature ?? data?.price_per_signature ?? 1.00);
      const sigs = Number(data?.metrics?.total_signatures_verified ?? data?.total_signature_checks ?? 0);
      const addon = Boolean(data?.signature_addon_active ?? data?.signature_addon_enabled ?? false);
      // Task 2: signature_unlocked from DB via updated billing endpoint
      const unlocked = Boolean(data?.signature_unlocked ?? false);

      // Task 2: Bill = Total Pages * Rate Per Page (as specified)
      const bill = parseFloat((pages * ratePage).toFixed(2));

      setTotalPagesScanned(pages);
      setRatePerPage(ratePage);
      setRatePerSignature(rateSig);
      setTotalEstimatedBill(bill);
      setSignatureAddonActive(addon);
      setSignatureUnlocked(unlocked);
      setTotalSignaturesScanned(sigs);
      setCompanyId(data?.company_id || user?.company_id || 'COMPANY');
      setCompanyName(data?.company_name || user?.company_name || 'Enterprise Client');

      setEditingRate(ratePage);
      setEditingSigRate(rateSig);
    } catch (err: any) {
      console.error('Billing fetch notice:', err);
      try {
        // Admin fallback
        const adminOverview: any = await api.getAdminOverview('monthly');
        const pricing = adminOverview?.active_pricing || {};
        const pRate = Number(pricing.price_per_page ?? 0.50);
        const sRate = Number(pricing.price_per_signature_check ?? 1.00);
        setRatePerPage(pRate);
        setRatePerSignature(sRate);
        setEditingRate(pRate);
        setEditingSigRate(sRate);
        const pages = Number(adminOverview?.platform_totals?.total_pages_processed ?? 0);
        setTotalPagesScanned(pages);
        setTotalEstimatedBill(parseFloat((pages * pRate).toFixed(2)));
      } catch {
        setErrorState(
          err?.response?.data?.detail || err?.message || 'Failed to fetch billing metrics from server.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingData();
  }, []);

  // Update rates handler (admin only)
  const handleUpdateRates = async () => {
    setRateUpdating(true);
    setErrorState(null);
    try {
      await api.updateBillingPricing(editingRate, editingSigRate);
      setRatePerPage(editingRate);
      setRatePerSignature(editingSigRate);

      // Task 2: Recalculate — bill = pages * rate only
      const newEstimated = parseFloat((totalPagesScanned * editingRate).toFixed(2));
      setTotalEstimatedBill(newEstimated);

      setSavedRateToast(true);
      setTimeout(() => setSavedRateToast(false), 3000);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to update pricing rates.';
      setErrorState(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setRateUpdating(false);
    }
  };

  // Toggle Signature Addon (requires signatureUnlocked to be true)
  const handleToggleAddon = async () => {
    if (!signatureUnlocked) return; // Guard — feature locked
    const targetCompany = user?.company_id || companyId;
    if (!targetCompany) {
      setErrorState('No authenticated company found.');
      return;
    }
    const newStatus = !signatureAddonActive;
    setErrorState(null);
    try {
      await api.toggleSignatureAddon(targetCompany, newStatus);
      setSignatureAddonActive(newStatus);

      // Recalculate — base bill stays pages * rate
      const newEstimated = parseFloat((totalPagesScanned * ratePerPage).toFixed(2));
      setTotalEstimatedBill(newEstimated);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to toggle signature add-on.';
      setErrorState(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
  };

  return (
    <div className="space-y-8">
      {/* TOP HEADER ACTIONS */}
      <PageHeaderActions>
        <span className={`text-xs px-3 py-1.5 rounded-full font-semibold border ${
          isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700 shadow-sm'
        }`}>
          Organization: <strong className="text-indigo-400">{companyName || 'Technova Solutions Pvt Ltd'}</strong>{companyId ? ` (${companyId})` : ''}
        </span>
      </PageHeaderActions>

      {/* ERROR ALERT BANNER */}
      {errorState && (
        <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{errorState}</span>
          </div>
          <button onClick={() => setErrorState(null)} className="text-xs text-rose-300 hover:text-white font-bold ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* 1. DYNAMIC METRICS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* STAT 1: Total Pages Scanned */}
        <div className={`p-5 rounded-2xl border transition-all ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold tracking-wider uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Total Pages Scanned
            </span>
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <FileCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-extrabold tracking-tight">
              {loading ? (
                <span className="inline-block w-16 h-8 bg-slate-700/30 animate-pulse rounded" />
              ) : (
                totalPagesScanned.toLocaleString()
              )}
            </span>
            <span className="text-xs font-semibold text-slate-400 block mt-1">
              actual pages processed this cycle
            </span>
          </div>
        </div>

        {/* STAT 2: Rate Per Page — INR ₹ */}
        <div className={`p-5 rounded-2xl border transition-all ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold tracking-wider uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Rate Per Page (Active)
            </span>
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <IndianRupee className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-extrabold tracking-tight text-indigo-400">
              ₹{(ratePerPage ?? 0).toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-slate-400 block mt-1">
              active platform scan rate
            </span>
          </div>
        </div>

        {/* STAT 3: Total Estimated Bill — INR ₹ (pages * rate) */}
        <div className={`p-5 rounded-2xl border transition-all ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold tracking-wider uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Total Estimated Bill
            </span>
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-extrabold tracking-tight text-emerald-400">
              ₹{(totalEstimatedBill ?? 0).toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-emerald-500 block mt-1">
              pages × rate per page
            </span>
          </div>
        </div>

        {/* STAT 4: Signature Addon Status */}
        <div className={`p-5 rounded-2xl border transition-all ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold tracking-wider uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Signature Add-on
            </span>
            <div className={`p-2.5 rounded-xl border ${
              signatureUnlocked
                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                : 'bg-slate-700/30 text-slate-500 border-slate-700/50'
            }`}>
              {signatureUnlocked ? <Zap className="w-5 h-5 fill-current" /> : <Lock className="w-5 h-5" />}
            </div>
          </div>
          <div className="mt-4">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
              !signatureUnlocked
                ? 'bg-slate-800 text-slate-500 border border-slate-700'
                : signatureAddonActive
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              {!signatureUnlocked ? 'Locked' : signatureAddonActive ? 'Active' : 'Inactive'}
            </span>
            <span className="text-xs text-slate-400 block mt-1">
              {signatureUnlocked
                ? `${totalSignaturesScanned} stamp verifications logged`
                : 'Contact admin to unlock'}
            </span>
          </div>
        </div>

      </div>

      {/* 2. CONTROLS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* ADMIN PRICING CARD — hidden for non-admin users (Task 2) */}
        {isAdmin && (
          <div className={`p-6 rounded-2xl border space-y-4 ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center justify-between border-b border-slate-200/10 pb-3">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold">Admin Pricing Rate Configuration</h3>
              </div>
              {savedRateToast && (
                <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold animate-pulse">
                  Rates Updated!
                </span>
              )}
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className={`block font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Base Price Per Page Scanned (₹):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingRate}
                  onChange={(e) => setEditingRate(parseFloat(e.target.value) || 0)}
                  className={`w-full px-3 py-2 rounded-xl font-mono text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                    isDark ? 'bg-slate-950 border-slate-800 text-indigo-400' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className={`block font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Price Per Signature &amp; Stamp Check (₹):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingSigRate}
                  onChange={(e) => setEditingSigRate(parseFloat(e.target.value) || 0)}
                  className={`w-full px-3 py-2 rounded-xl font-mono text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                    isDark ? 'bg-slate-950 border-slate-800 text-indigo-400' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleUpdateRates}
                  disabled={rateUpdating}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {rateUpdating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  <span>Save New Pricing Rates</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PREMIUM SIGNATURE ADD-ON PANEL */}
        <div className={`p-6 rounded-2xl border space-y-4 flex flex-col justify-between relative overflow-hidden ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        } ${!isAdmin && 'lg:col-span-2'}`}>

          {/* Lock overlay for companies where signature is not unlocked (Task 2 & 3) */}
          {!signatureUnlocked && (
            <div className="absolute inset-0 z-10 rounded-2xl backdrop-blur-[2px] bg-slate-950/75 flex flex-col items-center justify-center gap-3 p-6 text-center animate-in fade-in">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Lock className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-200">Signature &amp; Stamp Verification Locked</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Neural vision verification is a restricted enterprise capability. Unlock with an administrative access key.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUnlockError(null);
                  setShowUnlockModal(true);
                }}
                className="mt-1 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Key className="w-3.5 h-3.5" />
                <span>Unlock with Admin Token</span>
              </button>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between border-b border-slate-200/10 pb-3">
              <div className="flex items-center space-x-2">
                <Zap className="w-5 h-5 text-amber-400 fill-current" />
                <h3 className="text-base font-bold">Signature &amp; Stamp Verification Add-on</h3>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!signatureUnlocked) {
                    setUnlockError(null);
                    setShowUnlockModal(true);
                  }
                }}
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold border transition-all ${
                  !signatureUnlocked
                    ? 'bg-slate-800 text-amber-400 border-amber-500/30 hover:border-amber-500 cursor-pointer'
                    : signatureAddonActive
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {!signatureUnlocked ? '🔒 LOCKED (CLICK TO UNLOCK)' : signatureAddonActive ? 'ACTIVE' : 'INACTIVE'}
              </button>
            </div>

            <p className={`text-xs leading-relaxed mt-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Enables neural vision algorithms to detect government stamps, notary seals, and digital signatures on candidate documents.
            </p>
          </div>

          <div className={`p-4 rounded-xl border flex items-center justify-between ${
            isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div>
              <span className="text-xs font-bold block">Toggle Add-on Subscription</span>
              <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                ₹{(ratePerSignature ?? 1.00).toFixed(2)} per verified signature
              </span>
            </div>

            <button
              onClick={handleToggleAddon}
              disabled={!signatureUnlocked}
              title={!signatureUnlocked ? 'Feature locked — contact admin' : ''}
              className={`p-2 rounded-xl transition-all flex items-center space-x-2 font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed ${
                signatureAddonActive
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
            >
              {signatureAddonActive ? (
                <>
                  <ToggleRight className="w-6 h-6 text-emerald-300" />
                  <span>Enabled</span>
                </>
              ) : (
                <>
                  <ToggleLeft className="w-6 h-6 text-slate-500" />
                  <span>Disabled</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>

      {/* 3. BILLING BREAKDOWN */}
      <div className={`p-6 rounded-2xl border ${
        isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold">Billing Breakdown Status</h3>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Accumulated usage logs for the active billing cycle — Total = Pages × Rate
            </p>
          </div>

          <button
            onClick={fetchBillingData}
            disabled={loading}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${
              isDark ? 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Ledger</span>
          </button>
        </div>

        <div className={`p-5 rounded-xl border text-xs ${
          isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex flex-col sm:flex-row justify-between gap-3 text-slate-400">
            <span>
              Base Pages Billed: <strong className="text-slate-200 font-mono">{totalPagesScanned}</strong>
              {' '}@ <strong className="text-indigo-400 font-mono">₹{(ratePerPage ?? 0).toFixed(2)}</strong>/page
            </span>
            <span>
              Signatures Verified: <strong className="text-slate-200 font-mono">{totalSignaturesScanned}</strong>
              {' '}@ <strong className="font-mono">₹{(ratePerSignature ?? 0).toFixed(2)}</strong>/check
            </span>
            <span>
              Total Estimated: <strong className="text-emerald-400 font-mono text-sm">₹{(totalEstimatedBill ?? 0).toFixed(2)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 4. SUCCESS TOAST BANNER */}
      {unlockSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-xl bg-emerald-600 text-white shadow-xl shadow-emerald-900/40 flex items-center gap-3 border border-emerald-400 animate-in slide-in-from-bottom-5">
          <CheckCircle className="w-5 h-5 text-emerald-200 flex-shrink-0" />
          <div>
            <div className="text-xs font-bold">Signature Verification Unlocked!</div>
            <div className="text-[11px] text-emerald-100">You can now toggle the subscription add-on for this organization.</div>
          </div>
          <button
            onClick={() => setUnlockSuccessToast(false)}
            className="text-emerald-200 hover:text-white ml-2 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* 5. ADMIN UNLOCK MODAL (Task 3) */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 animate-in fade-in">
          <div className={`relative w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-4 ${
            isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between border-b border-slate-200/10 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Unlock Signature Verification</h3>
                  <p className="text-[11px] text-slate-400">Organization: {companyName || companyId || 'Default'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowUnlockModal(false);
                  setUnlockError(null);
                  setSecretTokenInput('');
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Enter the single-use <strong>Unlock Token</strong> provided by your administrator to activate neural signature and notary stamp inspection for this organization. Tokens burn automatically upon activation.
            </p>

            <form onSubmit={handleUnlockSignature} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-bold mb-1.5 text-slate-300">
                  Single-Use Unlock Token
                </label>
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    placeholder="e.g., SIG-UNLOCK-A1B2C3D4"
                    value={secretTokenInput}
                    onChange={(e) => setSecretTokenInput(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono border focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
                      isDark
                        ? 'bg-slate-950 border-slate-800 text-amber-400 placeholder:text-slate-600'
                        : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
                    }`}
                  />
                </div>
              </div>

              {unlockError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{unlockError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowUnlockModal(false);
                    setUnlockError(null);
                    setSecretTokenInput('');
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border ${
                    isDark ? 'border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white' : 'border-slate-300 hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={unlockLoading || !secretTokenInput.trim()}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {unlockLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <Key className="w-3.5 h-3.5" />
                      <span>Unlock Feature</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Billing;
