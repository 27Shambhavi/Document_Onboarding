import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/admin';
import type { CompanyItem } from '../../types';
import {
  Building2,
  Key,
  Check,
  X,
  Eye,
  Loader2,
  Copy,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';

export const CompaniesList: React.FC = () => {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite token states
  const [tokenLoading, setTokenLoading] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [tokenExpiry, setTokenExpiry] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Approval/Rejection states
  const [actionCompany, setActionCompany] = useState<CompanyItem | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchCompanies = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.getCompanies();
      setCompanies(data.companies || []);
    } catch (err: any) {
      console.error(err);
      setError('Failed to retrieve registered companies.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleGenerateToken = async () => {
    setTokenLoading(true);
    setGeneratedToken(null);
    setCopied(false);
    try {
      const res = await adminApi.generateInviteToken();
      setGeneratedToken(res.token);
      setTokenExpiry(new Date(res.expires_at).toLocaleString());
    } catch (err: any) {
      console.error(err);
      alert('Failed to generate invite token.');
    } finally {
      setTokenLoading(false);
    }
  };

  const handleCopyToken = () => {
    if (generatedToken) {
      navigator.clipboard.writeText(generatedToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const executeCompanyAction = async () => {
    if (!actionCompany || !actionType) return;
    setActionLoading(true);
    try {
      if (actionType === 'approve') {
        await adminApi.approveCompany(actionCompany.company_id);
      } else {
        await adminApi.rejectCompany(actionCompany.company_id);
      }
      await fetchCompanies();
      setActionCompany(null);
      setActionType(null);
    } catch (err: any) {
      console.error(err);
      alert(`Failed to ${actionType} company.`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card p-6 border border-border rounded-2xl shadow-sm transition-colors">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Companies Management</h1>
          <p className="text-sm text-muted-foreground">
            Generate client invitation tokens and evaluate pending tenant registrations.
          </p>
        </div>
        <div>
          <button
            onClick={handleGenerateToken}
            disabled={tokenLoading}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 h-11 border border-transparent rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 disabled:opacity-60 transition-all duration-200 shadow-md shadow-primary/10"
          >
            {tokenLoading ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : (
              <Key className="h-4.5 w-4.5" />
            )}
            Generate Onboarding Token
          </button>
        </div>
      </div>

      {/* Generated Token Showcase Panel */}
      {generatedToken && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-foreground">Invite Token Generated</h3>
              <p className="text-xs text-muted-foreground">
                Provide this single-use code to the client representative. It will expire in 48 hours.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center max-w-lg">
            <div className="flex-1 bg-background border border-border font-mono text-sm font-bold text-foreground px-4 py-2.5 rounded-xl select-all text-center sm:text-left">
              {generatedToken}
            </div>
            <button
              onClick={handleCopyToken}
              className="inline-flex items-center justify-center gap-1.5 h-11 px-4 border border-border bg-card hover:bg-muted text-xs font-semibold rounded-xl text-muted-foreground hover:text-foreground transition-all duration-200"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-cyan-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy Token
                </>
              )}
            </button>
          </div>
          {tokenExpiry && (
            <p className="text-[10px] text-primary font-semibold flex items-center gap-1 pl-0.5">
              <Clock className="h-4 w-4" />
              Valid until: {tokenExpiry}
            </p>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {actionCompany && actionType && (
        <div className="fixed inset-0 z-50 bg-slate-905/60 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl max-w-md w-full p-6 border border-border shadow-xl space-y-5">
            <div className="flex items-start gap-3.5">
              {actionType === 'approve' ? (
                <div className="p-2.5 bg-green-500/10 text-green-500 rounded-xl border border-green-500/20">
                  <CheckCircle2 className="h-5.5 w-5.5" />
                </div>
              ) : (
                <div className="p-2.5 bg-rose-500/10 text-rose-500 rounded-xl border border-rose-500/20">
                  <AlertCircle className="h-5.5 w-5.5" />
                </div>
              )}
              <div className="space-y-1">
                <h3 className="text-base font-bold capitalize text-foreground">
                  {actionType} Company Application
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed mt-2.5">
                  Are you sure you want to {actionType} the account details for{' '}
                  <span className="font-bold select-all text-foreground">
                    {actionCompany.company_name}
                  </span>{' '}
                  ({actionCompany.company_id})?
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-border">
              <button
                onClick={() => {
                  setActionCompany(null);
                  setActionType(null);
                }}
                disabled={actionLoading}
                className="h-10 px-4 border border-border text-xs font-semibold rounded-xl text-muted-foreground bg-card hover:bg-muted hover:text-foreground transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={executeCompanyAction}
                disabled={actionLoading}
                className={`h-10 px-4 border border-transparent text-xs font-bold rounded-xl text-white shadow-sm transition-colors disabled:opacity-60 flex items-center gap-1.5 ${
                  actionType === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-primary hover:bg-primary/90'
                }`}
              >
                {actionLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Companies Table List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
          <span className="text-sm font-medium text-muted-foreground">Loading registered companies...</span>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-rose-500 flex-shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm transition-colors">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted">
            <h2 className="text-base font-bold text-foreground">Active Registrations</h2>
            <span className="text-[10px] text-muted-foreground font-semibold bg-card px-2.5 py-0.5 rounded-full border border-border font-bold uppercase tracking-wider">
              {companies.length} Registered
            </span>
          </div>

          {companies.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-left text-sm">
                <thead className="bg-muted text-muted-foreground text-xs font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Company</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4 text-center">Company ID</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4">Registered At</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {companies.map((company) => (
                    <tr key={company.company_id} className="hover:bg-primary/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap font-semibold text-foreground">
                        {company.company_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                        {company.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-muted-foreground font-mono select-all text-xs">
                        {company.company_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase border ${
                            company.status === 'ACTIVE'
                              ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20'
                              : company.status === 'PENDING'
                              ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse'
                              : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                          }`}
                        >
                          {company.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-muted-foreground text-xs">
                        {new Date(company.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-medium">
                        {company.status === 'PENDING' ? (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setActionCompany(company);
                                setActionType('approve');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-505 rounded-xl border border-green-500/20 transition-all text-xs font-bold"
                            >
                              <Check className="h-3 w-3" /> Approve
                            </button>
                            <button
                              onClick={() => {
                                setActionCompany(company);
                                setActionType('reject');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-xl border border-rose-500/20 transition-all text-xs font-bold"
                            >
                              <X className="h-3 w-3" /> Reject
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => navigate(`/admin/companies/${company.company_id}`)}
                            className="inline-flex items-center gap-1 px-3 h-9 text-muted-foreground bg-card border border-border hover:bg-muted hover:text-foreground rounded-xl transition-all text-xs font-semibold"
                          >
                            <Eye className="h-3.5 w-3.5 text-primary" /> View Details
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <Building2 className="h-8 w-8 text-muted-foreground/30 mx-auto" />
              <div>
                <p className="text-sm font-semibold text-foreground">No companies found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Generate an onboarding token to register new client tenants.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
