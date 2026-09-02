import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/admin';
import {
  TrendingUp,
  FileText,
  DollarSign,
  Briefcase,
  Loader2,
  AlertCircle,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [analytics, setAnalytics] = useState<any>(null);
  const [period, setPeriod] = useState<string>('monthly');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = async (selectedPeriod: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.getPlatformOverview(selectedPeriod);
      setAnalytics(data);
    } catch (err: any) {
      console.error(err);
      setError('Analytics overview data is not available.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview(period);
  }, [period]);

  const platformTotals = analytics?.platform_totals;
  const activePricing = analytics?.active_pricing;
  const companiesBreakdown = analytics?.companies_breakdown || [];

  return (
    <div className="space-y-6">
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Platform Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Global metrics, revenue records, and multi-tenant active logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Period:</span>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="block w-36 py-2 pl-4 pr-10 border border-border bg-card text-foreground rounded-xl focus:outline-none text-sm font-medium"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="all">All-Time</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
          <span className="text-sm font-medium text-muted-foreground">Loading system metrics...</span>
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
          {/* Metrics Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-card border border-border p-5 rounded-2xl shadow-sm flex items-center justify-between transition-colors">
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Scans</p>
                <p className="text-2xl font-extrabold text-foreground">
                  {platformTotals?.total_requests_processed !== undefined ? platformTotals.total_requests_processed : 0}
                </p>
              </div>
              <div className="p-2.5 bg-primary/10 text-primary rounded-xl border border-primary/20">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-card border border-border p-5 rounded-2xl shadow-sm flex items-center justify-between transition-colors">
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pages Processed</p>
                <p className="text-2xl font-extrabold text-foreground">
                  {platformTotals?.total_pages_processed !== undefined ? platformTotals.total_pages_processed : 0}
                </p>
              </div>
              <div className="p-2.5 bg-primary/10 text-primary rounded-xl border border-primary/20">
                <FileText className="h-5 w-5" />
              </div>
            </div>

            <div className="bg-card border border-border p-5 rounded-2xl shadow-sm flex items-center justify-between transition-colors">
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Platform Revenue</p>
                <p className="text-2xl font-extrabold text-foreground">
                  {platformTotals?.total_revenue_generated !== undefined
                    ? `${platformTotals?.currency || 'INR'} ${platformTotals.total_revenue_generated.toFixed(2)}`
                    : 'Not available'}
                </p>
              </div>
              <div className="p-2.5 bg-primary/10 text-primary rounded-xl border border-primary/20">
                <DollarSign className="h-5 w-5" />
              </div>
            </div>
          </div>

          {/* Pricing Rates Config Block */}
          {activePricing && (
            <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 transition-colors">
              <h2 className="text-sm font-bold flex items-center gap-2 text-foreground">
                Active Pricing Scheme
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-muted p-4 border border-border rounded-xl flex justify-between items-center">
                  <span className="text-xs font-semibold text-muted-foreground">Base rate per PDF page scan:</span>
                  <span className="text-sm font-bold font-mono text-foreground">
                    {activePricing.currency} {activePricing.price_per_page.toFixed(2)}
                  </span>
                </div>
                <div className="bg-muted p-4 border border-border rounded-xl flex justify-between items-center">
                  <span className="text-xs font-semibold text-muted-foreground">Premium Signature Verification:</span>
                  <span className="text-sm font-bold font-mono text-foreground">
                    {activePricing.currency} {activePricing.price_per_signature_check.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Company Listing Table */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm transition-colors">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted">
              <h2 className="text-base font-bold text-foreground">Active Client Scans Summary</h2>
              <span className="px-3 py-0.5 text-[10px] rounded-full bg-primary/15 text-primary border border-primary/20 font-bold uppercase tracking-wider">
                {companiesBreakdown.length} Tenants
              </span>
            </div>
            {companiesBreakdown.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border text-left text-sm">
                  <thead className="bg-muted text-muted-foreground text-xs font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Company Name</th>
                      <th className="px-6 py-4 text-center">Company ID</th>
                      <th className="px-6 py-4 text-center">Total Scans</th>
                      <th className="px-6 py-4 text-center">Pages Analyzed</th>
                      <th className="px-6 py-4 text-right">Accumulated Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {companiesBreakdown.map((company: any) => (
                      <tr key={company.company_id} className="hover:bg-primary/5 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap font-semibold text-foreground">
                          {company.company_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-muted-foreground font-mono select-all text-xs">
                          {company.company_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-foreground font-bold">
                          {company.requests}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-muted-foreground font-semibold">
                          {company.pages}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right font-bold font-mono text-foreground">
                          {activePricing?.currency || 'INR'} {company.amount_due.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground space-y-2">
                <Briefcase className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                <p className="text-xs font-medium">No company scanning records found.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
