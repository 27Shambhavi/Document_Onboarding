import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/admin';
import {
  Settings,
  DollarSign,
  TrendingUp,
  Fingerprint,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

export const AdminSettings: React.FC = () => {
  const [pricePerPage, setPricePerPage] = useState<number>(0.50);
  const [pricePerSig, setPricePerSig] = useState<number>(1.00);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchPricing = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.getPlatformOverview('monthly');
      if (data?.active_pricing) {
        setPricePerPage(data.active_pricing.price_per_page);
        setPricePerSig(data.active_pricing.price_per_signature_check);
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to fetch current pricing rate details from backend.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPricing();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await adminApi.updatePricingRates({
        price_per_page: Number(pricePerPage),
        price_per_signature_check: Number(pricePerSig),
      });
      setSuccess('Pricing configuration updated successfully.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error(err);
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'Failed to update pricing rates. Ensure inputs are valid positive numbers.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Administrative Settings</h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          Configure platform-wide transaction billing plans and pricing schemes.
        </p>
      </div>

      {success && (
        <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-500 flex items-center gap-3 text-xs font-semibold">
          <CheckCircle className="h-4.5 w-4.5 text-cyan-500 flex-shrink-0" />
          {success}
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 flex items-center gap-3 text-xs font-semibold">
          <AlertCircle className="h-4.5 w-4.5 text-rose-500 flex-shrink-0" />
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
          <span className="text-xs font-medium text-muted-foreground">Loading billing config...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Pricing Form Card */}
          <form onSubmit={handleSave} className="lg:col-span-2 bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm space-y-5 transition-colors">
            <h3 className="text-lg font-semibold flex items-center gap-2.5 text-foreground">
              <Settings className="h-5.5 w-5.5 text-primary" />
              Pricing Rate Schemes
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="price-page" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Standard Rate Per PDF Page Scan (INR)
                </label>
                <div className="mt-2 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <DollarSign className="h-4.5 w-4.5 text-muted-foreground" />
                  </div>
                  <input
                    id="price-page"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={pricePerPage}
                    onChange={(e) => setPricePerPage(Number(e.target.value))}
                    className="block w-full pl-10 pr-4 py-2.5 border border-border bg-background focus:outline-none text-sm text-foreground font-medium"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 leading-normal">Billed per page contained in processed documents.</p>
              </div>

              <div>
                <label htmlFor="price-sig" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Signature Verification Rate (INR)
                </label>
                <div className="mt-2 relative rounded-md shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <DollarSign className="h-4.5 w-4.5 text-muted-foreground" />
                  </div>
                  <input
                    id="price-sig"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={pricePerSig}
                    onChange={(e) => setPricePerSig(Number(e.target.value))}
                    className="block w-full pl-10 pr-4 py-2.5 border border-border bg-background focus:outline-none text-sm text-foreground font-medium"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 leading-normal">Add-on cost logged for signature audits checks.</p>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-border">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 h-11 px-5 border border-transparent rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary/95 disabled:opacity-60 transition-all duration-200 shadow-md shadow-primary/10"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Configuration
              </button>
            </div>
          </form>

          {/* Pricing Info Card */}
          <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 h-fit transition-colors">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pricing Context</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Updates to base rates and signature checks are immediately applied to newly processed documents across all active client accounts.
            </p>
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center gap-2 text-xs text-foreground">
                <TrendingUp className="h-4.5 w-4.5 text-primary" />
                <span>Base rates track PDF scans workload.</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-foreground">
                <Fingerprint className="h-4.5 w-4.5 text-purple-400" />
                <span>Premium checks require signature add-on activation.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
