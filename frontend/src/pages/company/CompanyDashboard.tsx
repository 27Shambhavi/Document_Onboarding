import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { companyApi } from '../../api/company';
import { storageUtil } from '../../utils/storage';
import type { CompanyUsageSummary } from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  TrendingUp,
  FileText,
  DollarSign,
  Fingerprint,
  FileCode,
  UploadCloud,
  Loader2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';

export const CompanyDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [usage, setUsage] = useState<CompanyUsageSummary | null>(null);
  const [period, setPeriod] = useState<string>('monthly');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [historyStats, setHistoryStats] = useState({
    total: 0,
    processing: 0,
    processed: 0,
    actionRequired: 0,
    failed: 0
  });

  const fetchClientUsage = async (selectedPeriod: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await companyApi.getClientUsageSummary(selectedPeriod);
      setUsage(data);
    } catch (err: any) {
      console.error(err);
      setError('Client account metrics are not available.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClientUsage(period);
  }, [period]);

  useEffect(() => {
    const docs = storageUtil.getDocuments();
    const stats = {
      total: docs.length,
      processing: docs.filter(d => d.status === 'PROCESSING' || d.status === 'PENDING').length,
      processed: docs.filter(d => d.status === 'PROCESSED').length,
      actionRequired: docs.filter(d => d.status === 'ACTION_REQUIRED').length,
      failed: docs.filter(d => d.status === 'QUALITY_FAILED' || d.status === 'REJECTED').length
    };
    setHistoryStats(stats);
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome Banner & Primary Action CTA */}
      <div className="app-card flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between sm:p-7">
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Welcome back, {user?.name || 'Client Partner'}
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Analyze document compliance logs and scan statistics. Keep your candidate onboarding queue cleared.
          </p>
        </div>

        <button
          onClick={() => navigate('/company/upload')}
          className="app-button-primary h-11 flex-shrink-0"
        >
          <UploadCloud className="h-4.5 w-4.5" />
          Upload Document
        </button>
      </div>

      {/* Primary Workspace CTA Card */}
      <div className="app-panel flex flex-col justify-between gap-6 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="space-y-1.5">
          <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Primary Action Workspace</h3>
          <p className="text-base font-semibold text-foreground">Upload and process employee/candidate documents</p>
          <p className="text-xs text-muted-foreground">Supports PDF credentials bundles and ZIP folders containing multiple files.</p>
        </div>
        <button
          onClick={() => navigate('/company/upload')}
          className="app-button-secondary h-11"
        >
          Open Upload Workspace <ArrowRight className="h-4 w-4 text-primary" />
        </button>
      </div>

      {/* Audit Pipeline Stats Cards */}
      <div className="space-y-4">
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Document Audit Pipeline Summary</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <div className="app-card flex min-h-[112px] flex-col justify-between p-5 text-center">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Uploaded</p>
            <p className="text-3xl font-extrabold text-foreground mt-1">{historyStats.total}</p>
          </div>
          <div className="app-card flex min-h-[112px] flex-col justify-between p-5 text-center">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Processing</p>
            <p className="text-3xl font-extrabold text-primary mt-1">{historyStats.processing}</p>
          </div>
          <div className="app-card flex min-h-[112px] flex-col justify-between p-5 text-center">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Processed</p>
            <p className="text-3xl font-extrabold text-emerald-500 mt-1">{historyStats.processed}</p>
          </div>
          <div className="app-card flex min-h-[112px] flex-col justify-between p-5 text-center">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Action Required</p>
            <p className="text-3xl font-extrabold text-[#F59E0B] mt-1">{historyStats.actionRequired}</p>
          </div>
          <div className="app-card flex min-h-[112px] flex-col justify-between p-5 text-center">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Failed</p>
            <p className="text-3xl font-extrabold text-rose-500 mt-1">{historyStats.failed}</p>
          </div>
        </div>
      </div>

      {/* Account Billing & Usage Status */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Account Billing Metrics</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Billing Period:</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded-lg border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="all">All-Time</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
            <span className="text-xs font-medium text-muted-foreground font-sans">Loading usage metrics...</span>
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 rounded-lg border border-yellow-500/20 bg-yellow-50 p-4 text-sm leading-relaxed text-yellow-700 dark:bg-yellow-950/20 dark:text-yellow-400">
            <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-foreground">Billing Stats Offline</p>
              <p className="mt-0.5 text-muted-foreground">{error}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="app-card flex items-center justify-between p-5">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Scans Run</p>
                <p className="text-xl font-extrabold text-foreground mt-1">{usage?.total_scans}</p>
              </div>
              <div className="app-icon h-10 w-10">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>

            <div className="app-card flex items-center justify-between p-5">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pages Processed</p>
                <p className="text-xl font-extrabold text-foreground mt-1">{usage?.total_pages}</p>
              </div>
              <div className="app-icon h-10 w-10">
                <FileText className="h-5 w-5" />
              </div>
            </div>

            <div className="app-card flex items-center justify-between p-5">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Signature Audits</p>
                <p className="text-xl font-extrabold text-foreground mt-1">{usage?.total_signature_checks}</p>
              </div>
              <div className="app-icon h-10 w-10">
                <Fingerprint className="h-5 w-5" />
              </div>
            </div>

            <div className="app-card flex items-center justify-between p-5">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Estimated Invoice</p>
                <p className="text-xl font-extrabold text-foreground mt-1">
                  INR {usage?.estimated_invoice_inr !== undefined ? usage.estimated_invoice_inr.toFixed(2) : '0.00'}
                </p>
              </div>
              <div className="app-icon h-10 w-10">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings Features Checklist & Blueprint Quicklinks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="app-card flex flex-col justify-between space-y-5 p-6 sm:p-7">
          <div className="space-y-2">
            <div className="app-icon h-11 w-11">
              <FileCode className="h-5.5 w-5.5" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Guidelines & Requirement Checklists</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Register custom guidelines documents or define JSON blueprints to automatically run compliance checks on candidate files.
            </p>
          </div>
          <button
            onClick={() => navigate('/company/guidelines')}
            className="app-button-secondary h-11 w-full"
          >
            Manage Policy Checklists
          </button>
        </div>

        <div className="app-card flex flex-col justify-between space-y-5 p-6 sm:p-7">
          <div className="space-y-2">
            <div className="app-icon h-11 w-11">
              <Fingerprint className="h-5.5 w-5.5" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Premium Add-on Features</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Verify signatures and audit formal contract alignments automatically. Enable this feature inside the settings manager.
            </p>
          </div>
          <button
            onClick={() => navigate('/company/settings')}
            className="app-button-secondary h-11 w-full"
          >
            Open Settings Console
          </button>
        </div>
      </div>
    </div>
  );
};
