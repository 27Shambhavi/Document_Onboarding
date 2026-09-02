import React, { useState, useEffect } from 'react';
import { companyApi } from '../../api/company';
import {
  Loader2,
  AlertCircle,
  Lock,
  CheckCircle,
  Clock
} from 'lucide-react';

const TOKENS = `
  .dv-scope {
    font-family: 'Public Sans', ui-sans-serif, system-ui, sans-serif;
    color: var(--ink);
  }
  .dv-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

  /* Ledger Stat Panels */
  .dv-stat-panel {
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 2px;
    padding: 20px;
    transition: border-color 120ms ease;
  }
  .dv-stat-panel:hover {
    border-color: var(--line-strong);
  }

  /* Ledger Table */
  .dv-table-container {
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 2px;
    overflow: hidden;
  }

  /* Entitlement Box */
  .dv-entitlement-box {
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 2px;
    padding: 16px;
  }
`;

export const CompanySettings: React.FC = () => {
  const [usage, setUsage] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsage = async () => {
      try {
        const data = await companyApi.getClientUsageSummary('all');
        setUsage(data);
      } catch (err: any) {
        console.error(err);
        setError('Transaction logs and usage metrics are not available.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchUsage();
  }, []);

  const currency = usage?.billing_summary?.currency || 'INR';

  return (
    <div className="dv-scope space-y-6">
      <style>{TOKENS}</style>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings & activity</h1>
        <p className="text-sm text-muted-foreground mt-1 font-sans">
          Review billing metrics, pricing rates, contract features, and usage history logs.
        </p>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2 border border-[var(--line)] bg-[var(--paper-2)] rounded">
          <Loader2 className="h-6 w-6 text-[var(--ink)] animate-spin" />
          <span className="text-xs font-semibold text-muted-foreground dv-mono">Loading account settings...</span>
        </div>
      ) : error ? (
        <div className="p-4 bg-[var(--uncleared-soft)] border border-[var(--line)] text-[var(--uncleared)] flex items-start gap-3 text-xs font-semibold rounded font-sans">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold">Usage statistics offline</h3>
            <p className="text-muted-foreground mt-0.5">{error}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
          
          {/* Main Area: Stats Summary & Transaction Logs */}
          <div className="space-y-6">
            
            {/* Ledger Stat Panels */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              <div className="dv-stat-panel">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Account balance</p>
                <p className="text-xl font-extrabold text-foreground mt-1.5 dv-mono">
                  {currency} {usage?.billing_summary?.total_amount_due !== undefined 
                    ? usage.billing_summary.total_amount_due.toFixed(2) 
                    : (usage?.estimated_invoice_inr !== undefined ? usage.estimated_invoice_inr.toFixed(2) : '0.00')}
                </p>
              </div>

              <div className="dv-stat-panel">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Scans processed</p>
                <p className="text-xl font-extrabold text-foreground mt-1.5 dv-mono">
                  {usage?.total_scans ?? 0}
                </p>
              </div>

              <div className="dv-stat-panel">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Pages audited</p>
                <p className="text-xl font-extrabold text-foreground mt-1.5 dv-mono">
                  {usage?.total_pages ?? 0}
                </p>
              </div>

            </div>

            {/* Transaction Logs Ledger */}
            <div className="dv-table-container">
              <div className="px-5 py-4 border-b border-[var(--line)] flex justify-between items-center bg-[var(--paper-2)]">
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[var(--ink)]" />
                  API Scan Transaction Logs
                </h3>
                <span className="text-[10px] text-muted-foreground font-bold font-mono">
                  ALL LOGS
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--line)] text-left text-xs">
                  <thead className="bg-[var(--paper-2)] text-muted-foreground font-bold uppercase tracking-wider border-b border-[var(--line)]">
                    <tr>
                      <th className="px-5 py-3 dv-mono text-[10px]">Request ID</th>
                      <th className="px-5 py-3 text-center dv-mono text-[10px]">Pages</th>
                      <th className="px-5 py-3 text-center dv-mono text-[10px]">Signatures</th>
                      <th className="px-5 py-3 dv-mono text-[10px]">Cost</th>
                      <th className="px-5 py-3 dv-mono text-[10px]">Timestamp</th>
                    </tr>
                  </thead>
                  
                  {usage?.usage_logs && usage.usage_logs.length > 0 ? (
                    <tbody className="divide-y divide-[var(--line)] bg-[var(--paper)] font-medium">
                      {usage.usage_logs.map((log: any) => (
                        <tr key={log.request_id || log.log_id} className="hover:bg-[var(--paper-2)] transition-colors">
                          <td className="px-5 py-3 font-mono text-foreground select-all">
                            {log.request_id || 'REQ-UNKNOWN'}
                          </td>
                          <td className="px-5 py-3 text-center font-mono text-foreground">
                            {log.total_pages}
                          </td>
                          <td className="px-5 py-3 text-center font-mono text-foreground">
                            {log.signature_checks_count}
                          </td>
                          <td className="px-5 py-3 font-mono text-foreground">
                            {currency} {log.cost_incurred.toFixed(2)}
                          </td>
                          <td className="px-5 py-3 text-muted-foreground font-mono text-[11px]">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  ) : (
                    /* Dashed row empty state inline with ledger sheet */
                    <tbody>
                      <tr>
                        <td colSpan={5} className="px-5 py-6 text-center text-muted-foreground border-dashed border-2 border-[var(--line)] bg-[var(--paper-2)] dv-mono text-xs">
                          No transactions logged yet.
                        </td>
                      </tr>
                    </tbody>
                  )}
                </table>
              </div>
            </div>

          </div>

          {/* Sidebar Area: Features Entitlements & Pricing Policies */}
          <div className="space-y-6">
            
            {/* Features Entitlements */}
            <div className="bg-[var(--paper-2)] border border-[var(--line)] rounded p-5 space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Features entitlements</h3>
              
              <div className="space-y-3">
                {/* Entitlement: Signature Scan Premium */}
                <div className="dv-entitlement-box space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-foreground">Signature Scan Premium</h4>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      Check if candidate contracts are signed. Includes multi-signatory validation.
                    </p>
                  </div>
                  <div>
                    {usage?.signature_addon_active ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[var(--verify)] text-[var(--paper)] border border-[var(--verify)] rounded">
                        <CheckCircle size={10} /> Active (Enabled)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border border-[var(--uncleared)] text-[var(--uncleared)] bg-[var(--uncleared-soft)] rounded">
                        <Lock size={10} /> Locked (Premium Addon)
                      </span>
                    )}
                  </div>
                </div>

                {/* Entitlement: Standard AI Audit */}
                <div className="dv-entitlement-box space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-foreground">Standard AI Audit</h4>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      Vision classification, OCR property extraction, and basic checklist guidelines matching.
                    </p>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[var(--ink)] text-[var(--paper)] border border-[var(--ink)] rounded">
                      Always Enabled
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pricing rates plan ledger */}
            <div className="bg-[var(--paper-2)] border border-[var(--line)] rounded p-5 space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Billing rates plan</h3>
              
              <div className="space-y-3 divide-y divide-border text-[11.5px]">
                
                <div className="flex justify-between py-1">
                  <span className="text-muted-foreground font-semibold">Standard OCR Scan (per page)</span>
                  <span className="font-bold text-foreground dv-mono">
                    {currency} {usage?.billing_summary?.rate_per_page !== undefined 
                      ? usage.billing_summary.rate_per_page.toFixed(2) 
                      : '5.00'}
                  </span>
                </div>

                <div className="flex justify-between pt-3">
                  <span className="text-muted-foreground font-semibold">Signature Validation Add-on</span>
                  <span className="font-bold text-foreground dv-mono">
                    {currency} {usage?.billing_summary?.rate_per_signature !== undefined 
                      ? usage.billing_summary.rate_per_signature.toFixed(2) 
                      : '2.00'}
                  </span>
                </div>

                <div className="flex justify-between pt-3">
                  <span className="text-muted-foreground font-semibold">Currency Denomination</span>
                  <span className="font-bold text-foreground dv-mono">
                    {currency}
                  </span>
                </div>

              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
};
