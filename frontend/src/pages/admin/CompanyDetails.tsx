import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/admin';
import type { CompanyUsageSummary } from '../../types';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  FileText,
  DollarSign,
  TrendingUp,
  Fingerprint,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  Briefcase,
} from 'lucide-react';

export const CompanyDetails: React.FC = () => {
  const { companyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();

  const [usage, setUsage] = useState<CompanyUsageSummary | null>(null);
  const [period, setPeriod] = useState<string>('monthly');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggleLoading, setToggleLoading] = useState(false);

  const fetchUsageDetails = async (selectedPeriod: string) => {
    if (!companyId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.getCompanyUsage(companyId, selectedPeriod);
      setUsage(data);
    } catch (err: any) {
      console.error(err);
      setError('Company metrics and usage records are not available.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsageDetails(period);
  }, [companyId, period]);

  const handleToggleAddon = async () => {
    if (!companyId || !usage) return;
    setToggleLoading(true);
    try {
      const nextStatus = !usage.is_signature_addon_enabled;
      await adminApi.toggleSignatureAddon(companyId, {
        is_signature_addon_enabled: nextStatus,
      });
      const updatedData = await adminApi.getCompanyUsage(companyId, period);
      setUsage(updatedData);
    } catch (err: any) {
      console.error(err);
      alert('Failed to toggle signature scanning add-on.');
    } finally {
      setToggleLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Back navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/companies')}
            className="p-2.5 border border-border bg-card text-muted-foreground hover:text-foreground rounded-xl transition-all shadow-sm"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              {usage?.company_name || companyId}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Detailed scanning statistics, usage log ledger, and billing setup.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Period:</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="block w-36 py-1.5 pl-3 pr-8 border border-border bg-card text-foreground rounded-xl focus:outline-none text-sm font-medium"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="all">All-Time</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
          <span className="text-sm font-medium text-muted-foreground">Loading client logs...</span>
        </div>
      ) : error ? (
        <div className="p-5 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-amber-500 flex items-start gap-3.5 text-sm leading-relaxed">
          <AlertCircle className="h-6 w-6 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-foreground">Metrics Not Available</h3>
            <p className="text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      ) : (
        <>
          {/* Metrics summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
            <div className="bg-card border border-border p-5 rounded-2xl shadow-sm flex items-center justify-between transition-colors">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Scans Run</p>
                <p className="text-xl font-extrabold text-foreground mt-1">{usage?.total_scans}</p>
              </div>
              <div className="p-2.5 bg-primary/10 text-primary rounded-xl border border-primary/20">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-card border border-border p-5 rounded-2xl shadow-sm flex items-center justify-between transition-colors">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pages Checked</p>
                <p className="text-xl font-extrabold text-foreground mt-1">{usage?.total_pages}</p>
              </div>
              <div className="p-2.5 bg-primary/10 text-primary rounded-xl border border-primary/20">
                <FileText className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-card border border-border p-5 rounded-2xl shadow-sm flex items-center justify-between transition-colors">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Signature Checks</p>
                <p className="text-xl font-extrabold text-foreground mt-1">{usage?.total_signature_checks}</p>
              </div>
              <div className="p-2.5 bg-primary/10 text-primary rounded-xl border border-primary/20">
                <Fingerprint className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-card border border-border p-5 rounded-2xl shadow-sm flex items-center justify-between transition-colors">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Estimated Invoice</p>
                <p className="text-xl font-extrabold text-foreground mt-1">
                  INR {usage?.estimated_invoice_inr !== undefined ? usage.estimated_invoice_inr.toFixed(2) : '0.00'}
                </p>
              </div>
              <div className="p-2.5 bg-primary/10 text-primary rounded-xl border border-primary/20">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
          </div>

          {/* Premium Add-ons Section */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 hover:border-primary/25 transition-all duration-200">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-purple-500/10 text-purple-400 rounded-2xl border border-purple-500/20 flex-shrink-0">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">Premium Add-on: Signature Scanning</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Allows candidate documents to be verified for handwritten signature presence.
                </p>
              </div>
            </div>

            <div>
              <button
                onClick={handleToggleAddon}
                disabled={toggleLoading}
                className={`inline-flex items-center gap-2 h-11 px-5 border rounded-xl text-xs font-semibold transition-all duration-200 disabled:opacity-60 ${
                  usage?.is_signature_addon_enabled
                    ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                    : 'bg-card border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {toggleLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : usage?.is_signature_addon_enabled ? (
                  <ToggleRight className="h-5 w-5 text-purple-400" />
                ) : (
                  <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                )}
                {usage?.is_signature_addon_enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>

          {/* Ledger History logs */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm transition-colors">
            <div className="px-5 py-4 border-b border-border bg-muted">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Usage Activity Logs</h2>
            </div>
            {usage?.usage_logs && usage.usage_logs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border text-left text-sm">
                  <thead className="bg-muted text-muted-foreground text-xs font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Log ID</th>
                      <th className="px-6 py-4">Request ID</th>
                      <th className="px-6 py-4 text-center">Pages</th>
                      <th className="px-6 py-4 text-center">Signatures</th>
                      <th className="px-6 py-4 text-right">Cost Incurred</th>
                      <th className="px-6 py-4">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {usage.usage_logs.map((log) => (
                      <tr key={log.log_id} className="hover:bg-primary/5 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold font-mono select-all text-foreground">
                          {log.log_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-muted-foreground font-mono select-all">
                          {log.request_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-center text-foreground font-semibold">
                          {log.total_pages}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-center text-foreground font-semibold">
                          {log.signature_checks_count}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-right font-bold font-mono text-foreground">
                          INR {log.cost_incurred.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground space-y-2">
                <Briefcase className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                <div>
                  <p className="text-sm font-semibold text-foreground">No scan events recorded</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Activity ledger logs will populate here once scanning pipeline is initiated.
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
