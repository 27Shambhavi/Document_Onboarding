import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { storageUtil, getLabelFromId, formatGuidelineRule } from '../../utils/storage';
import type { StoredDocument } from '../../utils/storage';
import {
  ArrowLeft,
  FileText,
  CheckCircle,
  XCircle,
  Code,
  AlertTriangle,
  Copy,
  Download,
  Check,
  AlertCircle
} from 'lucide-react';

export const DocumentDetails: React.FC = () => {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [docData, setDocData] = useState<StoredDocument | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'json'>('overview');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const initialView = searchParams.get('view');
    if (initialView === 'json') {
      setActiveTab('json');
    }
  }, [searchParams]);

  useEffect(() => {
    if (docId) {
      const data = storageUtil.getDocumentById(docId);
      console.log("DOCUMENT DETAILS LOADED", data);
      setDocData(data);
    }
  }, [docId]);

  if (!docData) {
    return (
      <div className="max-w-xl mx-auto bg-card border border-border rounded-2xl p-8 shadow-sm text-center space-y-5 transition-colors">
        <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
        <h3 className="text-lg font-bold text-foreground">Document Dossier Not Found</h3>
        <p className="text-xs text-muted-foreground">
          The compliance verification record does not exist in local history.
        </p>
        <button
          onClick={() => navigate('/company/documents')}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Return to Queue
        </button>
      </div>
    );
  }

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(docData.rawJson, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = () => {
    const blob = new Blob([JSON.stringify(docData.rawJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `document-dossier-${docData.id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: typeof docData.status) => {
    const base = "inline-flex items-center px-3.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider self-start sm:self-auto border";
    switch (status) {
      case 'PROCESSED':
        return `${base} bg-cyan-500/15 text-cyan-500 border-cyan-500/25`;
      case 'QUALITY_FAILED':
        return `${base} bg-rose-500/15 text-rose-500 border-rose-500/25`;
      case 'ACTION_REQUIRED':
        return `${base} bg-amber-500/15 text-amber-500 border-amber-500/25`;
      default:
        return `${base} bg-muted text-muted-foreground border-border`;
    }
  };

  const clearedGuidelines = Array.isArray(docData.clearedGuidelines)
    ? docData.clearedGuidelines
    : [];
  const unclearedGuidelines = Array.isArray(docData.unclearedGuidelines)
    ? docData.unclearedGuidelines
    : [];
  const hasCleared = clearedGuidelines.length > 0;
  const hasUncleared = unclearedGuidelines.length > 0;
  const hasGuidelines = hasCleared || hasUncleared;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/company/documents')}
            className="p-2.5 border border-border bg-card text-muted-foreground hover:text-foreground rounded-xl transition-all shadow-sm"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight font-mono select-all text-foreground">{docData.id}</h1>
              <span className="text-[9px] font-bold uppercase tracking-widest bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">
                {getLabelFromId(docData.id, docData.label)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-normal">
              Source file: <span className="font-semibold text-foreground select-all">{docData.filename}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="flex bg-muted p-1 rounded-xl border border-border">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'overview'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Overview Details
            </button>
            <button
              onClick={() => setActiveTab('json')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'json'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              JSON Response
            </button>
          </div>

          <span className={getStatusBadge(docData.status)}>
            {docData.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Properties Dossier */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 transition-colors">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Document Specifications</h3>
              
              <div className="space-y-3.5 divide-y divide-border text-xs">
                <div className="flex justify-between py-1.5">
                  <span className="text-muted-foreground font-medium">Document Category</span>
                  <span className="font-semibold text-foreground">{getLabelFromId(docData.id, docData.label)}</span>
                </div>
                <div className="flex justify-between pt-3.5 py-1.5">
                  <span className="text-muted-foreground font-medium">Request ID</span>
                  <span className="font-semibold font-mono text-[11px] select-all text-foreground">{docData.requestId}</span>
                </div>
                <div className="flex justify-between pt-3.5 py-1.5">
                  <span className="text-muted-foreground font-medium">Company Tenant ID</span>
                  <span className="font-semibold font-mono text-[11px] select-all text-foreground">{docData.companyId}</span>
                </div>
                <div className="flex justify-between pt-3.5 py-1.5">
                  <span className="text-muted-foreground font-medium">Total Page Count</span>
                  <span className="font-semibold text-foreground">{docData.pages}</span>
                </div>
                <div className="flex justify-between pt-3.5 py-1.5">
                  <span className="text-muted-foreground font-medium">Quality Checklist</span>
                  <span
                    className={`font-bold ${
                      docData.qualityStatus === 'FAILED' ? 'text-rose-500' : 'text-cyan-500'
                    }`}
                  >
                    {docData.qualityStatus === 'FAILED' ? 'FAILED' : 'PASSED'}
                  </span>
                </div>
                <div className="flex flex-col pt-3.5 py-1.5">
                  <span className="text-muted-foreground font-medium">Quality Note</span>
                  <span className="font-medium text-foreground mt-1.5 leading-relaxed text-xs bg-muted p-3 rounded-xl border border-border">
                    {docData.qualityReason || docData.extractedData?.doc_quality_issues || 'Acceptable document clarity.'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: OCR Properties & Guidelines */}
          <div className="lg:col-span-2 space-y-6">
            {/* Extracted Fields Card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm transition-colors">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted">
                <h3 className="text-sm font-semibold text-foreground">Extracted AI Properties</h3>
                <span className="text-[9px] font-bold uppercase tracking-widest bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">
                  Model OCR Output
                </span>
              </div>

              {docData.extractedData && Object.keys(docData.extractedData).filter(k => k !== 'doc_quality' && k !== 'doc_quality_issues').length > 0 ? (
                <table className="min-w-full divide-y divide-border text-xs">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wider w-1/3">
                        Property Name
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wider">
                        Extracted Value
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {Object.entries(docData.extractedData)
                      .filter(([key]) => key !== 'doc_quality' && key !== 'doc_quality_issues')
                      .map(([key, val]) => (
                        <tr key={key} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-3.5 font-mono text-[11px] text-muted-foreground select-all font-semibold">
                            {key}
                          </td>
                          <td className="px-6 py-3.5 font-medium select-all text-foreground">
                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-16 text-muted-foreground space-y-2">
                  <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-xs font-medium">No extracted OCR fields found. For full extractions, use 2-Stage auditing workspace.</p>
                </div>
              )}
            </div>

            {/* Guideline Auditing Verdicts Card */}
            <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 transition-colors">
              <h3 className="text-sm font-semibold text-foreground">Guidelines Auditing Checks</h3>
              
              <div className="space-y-4">
                {hasCleared && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                        🟢 CLEARED
                      </span>
                    </div>
                    <div className="space-y-2">
                      {clearedGuidelines.map((rule: string, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3.5 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl text-xs leading-relaxed"
                        >
                          <CheckCircle className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <span className="font-bold block text-emerald-600 dark:text-emerald-400 text-[10px] uppercase tracking-wider">
                              CLEARED
                            </span>
                            <span className="text-foreground text-xs leading-relaxed">{formatGuidelineRule(rule)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {hasUncleared && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25">
                        🔴 UNCLEARED
                      </span>
                    </div>
                    <div className="space-y-2">
                      {unclearedGuidelines.map((rule: string, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-start gap-3.5 p-4 bg-rose-500/5 border border-rose-500/20 rounded-2xl text-xs leading-relaxed"
                        >
                          <XCircle className="h-4.5 w-4.5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <span className="font-bold block text-rose-600 dark:text-rose-400 text-[10px] uppercase tracking-wider">
                              UNCLEARED
                            </span>
                            <span className="text-foreground text-xs leading-relaxed">{formatGuidelineRule(rule)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!hasGuidelines && (
                  <div className="flex items-center gap-2.5 p-4 bg-amber-500/5 border border-amber-500/20 text-amber-500 rounded-2xl text-xs font-semibold">
                    <AlertTriangle className="h-4.5 w-4.5 text-amber-500 flex-shrink-0" />
                    No guidelines checklist was validated on this document.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col transition-colors">
          {/* File details bar */}
          <div className="px-5 py-4 bg-muted border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Code className="h-4.5 w-4.5 text-primary" />
              <span className="text-sm font-semibold font-mono text-foreground">Dossier JSON payload</span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                onClick={handleCopyJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-xl text-xs font-semibold text-muted-foreground bg-card hover:bg-muted transition-all"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-cyan-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy JSON
                  </>
                )}
              </button>

              <button
                onClick={handleDownloadJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-xl text-xs font-semibold text-muted-foreground bg-card hover:bg-muted transition-all"
              >
                <Download className="h-3.5 w-3.5" />
                Download JSON
              </button>
            </div>
          </div>

          <div className="bg-background text-foreground font-mono text-xs overflow-x-auto max-h-[500px] p-5 leading-relaxed select-all">
            <pre>{JSON.stringify(docData.rawJson, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
};
