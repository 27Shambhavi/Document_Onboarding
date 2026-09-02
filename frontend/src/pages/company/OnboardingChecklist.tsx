import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { documentsApi } from '../../api/documents';
import { Dropzone } from '../../components/Dropzone';
import type {
  CandidateOCRData,
  CandidateVerificationResult,
} from '../../types';
import {
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Play,
  ArrowRight,
  Eye,
} from 'lucide-react';

type AuditMode = 'one_click' | 'two_stage';

export const OnboardingChecklist: React.FC = () => {
  const navigate = useNavigate();
  const [auditMode, setAuditMode] = useState<AuditMode>('one_click');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1-Click results
  const [auditResults, setAuditResults] = useState<CandidateVerificationResult[]>([]);
  
  // 2-Stage results
  const [ocrResults, setOcrResults] = useState<CandidateOCRData[]>([]);
  const [stage1Success, setStage1Success] = useState(false);
  const [verifyingStage2, setVerifyingStage2] = useState(false);

  const handleFileSelect = async (file: File) => {
    setIsLoading(true);
    setError(null);
    setAuditResults([]);
    setOcrResults([]);
    setStage1Success(false);

    try {
      if (auditMode === 'one_click') {
        const res = await documentsApi.auditCandidateFolder(file);
        setAuditResults(res.candidates || []);
        
        // Cache findings locally so DocumentDetails view can show details of each document
        res.candidates?.forEach((candidate) => {
          candidate.guideline?.forEach((verdict) => {
            const cacheKey = `doc_${verdict.id}`;
            const cachedDoc = {
              id: verdict.id,
              requestId: candidate.requestId,
              companyId: res.company_id,
              label: verdict.id.includes('ADH') ? 'Aadhar' : verdict.id.includes('PAN') ? 'PAN' : verdict.id.includes('RES') ? 'Resume' : 'Document',
              status: verdict.uncleared_guidelines.length > 0 ? 'ACTION_REQUIRED' : 'PROCESSED',
              cleared_guidelines: verdict.cleared_guidelines,
              uncleared_guidelines: verdict.uncleared_guidelines,
              ocr_data: {},
              raw_response: verdict,
            };
            sessionStorage.setItem(cacheKey, JSON.stringify(cachedDoc));
          });
        });
      } else {
        const res = await documentsApi.stage1ExtractOcr(file);
        setOcrResults(res.candidates_ocr_data || []);
        setStage1Success(true);
        
        // Cache OCR results locally for details routing
        res.candidates_ocr_data?.forEach((cand) => {
          cand.files?.forEach((doc) => {
            const cacheKey = `doc_${doc.id}`;
            const cachedDoc = {
              id: doc.id,
              requestId: cand.requestId,
              companyId: res.company_id,
              label: doc.label,
              status: doc.ocr_data?.doc_quality === 'Bad' ? 'QUALITY_FAILED' : 'PROCESSED',
              ocr_data: doc.ocr_data || {},
              cleared_guidelines: [],
              uncleared_guidelines: [],
              raw_response: doc,
            };
            sessionStorage.setItem(cacheKey, JSON.stringify(cachedDoc));
          });
        });
      }
    } catch (err: any) {
      console.error(err);
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'Document processing could not be completed. Ensure guidelines and blueprints are configured.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunStage2 = async () => {
    if (ocrResults.length === 0) return;
    setVerifyingStage2(true);
    setError(null);
    try {
      const res = await documentsApi.stage2VerifyGuidelines(ocrResults);
      // Map stage 2 outputs to auditResults to display checklist verdicts
      setAuditResults(res.verified_candidates || []);
      
      // Update sessionStorage cache with guideline verdicts
      res.verified_candidates?.forEach((candidate) => {
        candidate.guideline?.forEach((verdict) => {
          const cacheKey = `doc_${verdict.id}`;
          const rawCached = sessionStorage.getItem(cacheKey);
          if (rawCached) {
            const cached = JSON.parse(rawCached);
            cached.status = verdict.uncleared_guidelines.length > 0 ? 'ACTION_REQUIRED' : 'PROCESSED';
            cached.cleared_guidelines = verdict.cleared_guidelines;
            cached.uncleared_guidelines = verdict.uncleared_guidelines;
            cached.raw_response = { ...cached.raw_response, ...verdict };
            sessionStorage.setItem(cacheKey, JSON.stringify(cached));
          }
        });
      });

      // Clear stage 1 UI to show guideline checklist
      setStage1Success(false);
    } catch (err: any) {
      console.error(err);
      setError('Stage 2 guideline check failed.');
    } finally {
      setVerifyingStage2(false);
    }
  };

  const handleViewDetails = (docId: string) => {
    navigate(`/company/documents/${docId}`);
  };

  return (
    <div className="space-y-8">
      {/* Header and Mode Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Onboarding Queue</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload candidate files, run AI compliance processing, and view extraction reports.
          </p>
        </div>

        <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200 w-fit">
          <button
            onClick={() => {
              setAuditMode('one_click');
              setAuditResults([]);
              setOcrResults([]);
              setStage1Success(false);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              auditMode === 'one_click'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            1-Click Audit
          </button>
          <button
            onClick={() => {
              setAuditMode('two_stage');
              setAuditResults([]);
              setOcrResults([]);
              setStage1Success(false);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              auditMode === 'two_stage'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            2-Stage Audit
          </button>
        </div>
      </div>

      {/* Main Upload Dropzone */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-gray-900 tracking-tight">
          {auditMode === 'one_click' ? 'Ingest & Audit PDF/ZIP Folder' : 'Stage 1: Extract Document OCR'}
        </h2>
        <Dropzone
          onFileSelect={handleFileSelect}
          accept={['.zip', '.pdf']}
          isLoading={isLoading}
        />
      </div>

      {error && (
        <div className="p-4 bg-[var(--uncleared-soft)] border border-[var(--uncleared)]/25 rounded-xl text-[var(--uncleared)] flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-[var(--uncleared)] flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <h3 className="font-bold">Compliance Pipeline Error</h3>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Stage 1 Ingest Verification Actions */}
      {stage1Success && ocrResults.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Stage 1 OCR Extraction Results</h3>
              <p className="text-sm text-gray-500 mt-1">
                Document files detected and mapped to system IDs. Verify OCR before triggering Stage 2.
              </p>
            </div>
            <button
              onClick={handleRunStage2}
              disabled={verifyingStage2}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-transparent rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm"
            >
              {verifyingStage2 ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run Stage 2 Guidelines Verification
            </button>
          </div>

          <div className="space-y-6">
            {ocrResults.map((candidate, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-900">{candidate.candidate_file}</span>
                  <span className="text-xs text-gray-500 font-mono">REQ: {candidate.requestId}</span>
                </div>
                <div className="divide-y divide-gray-100 bg-white">
                  {candidate.files?.map((file) => (
                    <div key={file.id} className="p-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold text-gray-900">{file.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5 font-mono">ID: {file.id}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            file.ocr_data?.doc_quality === 'Bad'
                              ? 'bg-[var(--uncleared-soft)] text-[var(--uncleared)] border border-[var(--uncleared)]/20'
                              : 'bg-[var(--verify-soft)] text-[var(--verify)] border border-[var(--verify)]/20'
                          }`}
                        >
                          Quality: {file.ocr_data?.doc_quality || 'Good'}
                        </span>
                        <button
                          onClick={() => handleViewDetails(file.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded text-xs font-semibold text-gray-700"
                        >
                          <Eye className="h-3 w-3" /> View OCR
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guidelines Compliance Results Display */}
      {auditResults.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Compliance Verification Summary</h2>
          <div className="grid grid-cols-1 gap-6">
            {auditResults.map((candidate, idx) => (
              <div key={idx} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">{candidate.candidate_file}</h3>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">Customer ID: {candidate.customer_id}</p>
                  </div>
                  <span className="text-xs font-mono text-gray-500">REQ: {candidate.requestId}</span>
                </div>

                <div className="p-6 space-y-6">
                  {candidate.guideline?.map((verdict) => {
                    const isCleared = verdict.uncleared_guidelines.length === 0;
                    return (
                      <div
                        key={verdict.id}
                        className="border border-gray-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:shadow-sm transition-shadow"
                      >
                        <div className="space-y-3">
                          <div>
                            <h4 className="text-sm font-bold text-gray-900 font-mono">{verdict.id}</h4>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {verdict.id.includes('ADH') ? 'Aadhar Card' : verdict.id.includes('PAN') ? 'PAN Card' : verdict.id.includes('RES') ? 'Resume' : 'Onboarding Document'}
                            </p>
                          </div>

                          <div className="space-y-2">
                            {verdict.cleared_guidelines.map((rule, rIdx) => (
                              <p key={rIdx} className="text-xs text-[var(--ink-soft)] flex items-start gap-1.5">
                                <CheckCircle className="h-4 w-4 text-[var(--verify)] flex-shrink-0 mt-0.5" />
                                <span className="flex-1 font-medium">{rule}</span>
                              </p>
                            ))}
                            {verdict.uncleared_guidelines.map((rule, rIdx) => (
                              <p key={rIdx} className="text-xs text-[var(--uncleared)] flex items-start gap-1.5">
                                <XCircle className="h-4 w-4 text-[var(--uncleared)] flex-shrink-0 mt-0.5" />
                                <span className="flex-1 font-bold">{rule}</span>
                              </p>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col sm:items-end justify-between gap-3">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                              isCleared ? 'bg-[var(--verify-soft)] text-[var(--verify)] border border-[var(--verify)]/20' : 'bg-[var(--uncleared-soft)] text-[var(--uncleared)] border border-[var(--uncleared)]/20'
                            }`}
                          >
                            {isCleared ? 'Cleared' : 'Action Required'}
                          </span>
                          <button
                            onClick={() => handleViewDetails(verdict.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 mt-2 self-start sm:self-auto"
                          >
                            View Details <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
