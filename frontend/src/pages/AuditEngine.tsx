import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../App';
import { api, type AuditReport, type OCRExtractionResult } from '../api/client';
import {
  ShieldCheck,
  Upload,
  Zap,
  CheckCircle2,
  XCircle,
  FileText,
  Code2,
  Copy,
  Check,
  FileSearch,
  Sliders,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { CandidateProfileCard } from '../components/audit/CandidateProfileCard';
import { GuidelineResults } from '../components/audit/GuidelineResults';

export const AuditEngine: React.FC = () => {
  const { isDark } = useTheme();

  // 1. AUDIT MODE STATE
  const [auditMode, setAuditMode] = useState<'stage1' | 'stage2' | 'oneclick'>('oneclick');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Results State
  const [stage1Result, setStage1Result] = useState<OCRExtractionResult | null>(null);
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);

  // Dynamic Candidate Context (Parsed from response or file)
  const [extractedCandidateName, setExtractedCandidateName] = useState<string>('');

  // Task 2: Stage 2 OCR Injection & Manual JSON Editor state
  const [currentOcrPayload, setCurrentOcrPayload] = useState<any>(null);
  const [stage2JsonInput, setStage2JsonInput] = useState<string>('');

  const SAMPLE_OCR_PAYLOAD = {
    "Candidate Name": "Jane Doe",
    "Email": "jane.doe@example.com",
    "Mobile Number": "+91 9876543210",
    "Date of Birth": "15-08-1995",
    "PAN Number": "ABCDE1234F",
    "Aadhaar Number": "1234 5678 9012"
  };

  // Dual-view toggles: Default to human-friendly UI
  const [stage1ViewMode, setStage1ViewMode] = useState<'ui' | 'json'>('ui');
  const [resultsViewMode, setResultsViewMode] = useState<'text' | 'json'>('text');
  const [copiedJson, setCopiedJson] = useState(false);

  // Task 3: 4-phase OCR loading animation
  const OCR_PHASES = [
    { label: 'Initializing Vision Engine...', icon: '🔧', progress: 10 },
    { label: 'Reading Document Images...', icon: '📄', progress: 40 },
    { label: 'Extracting Structured Data...', icon: '🔍', progress: 70 },
    { label: 'Validating Blueprints...', icon: '✅', progress: 90 },
  ];
  const [ocrPhase, setOcrPhase] = useState(0);
  const phaseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start / stop animation based on loading state
  useEffect(() => {
    if (loading) {
      setOcrPhase(0);
      phaseTimerRef.current = setInterval(() => {
        setOcrPhase((prev) => (prev + 1) % OCR_PHASES.length);
      }, 1500);
    } else {
      if (phaseTimerRef.current) {
        clearInterval(phaseTimerRef.current);
        phaseTimerRef.current = null;
      }
    }
    return () => {
      if (phaseTimerRef.current) clearInterval(phaseTimerRef.current);
    };
  }, [loading]);

  // Task 2: Hydrate audit state from sessionStorage on mount
  useEffect(() => {
    try {
      const s1 = sessionStorage.getItem('audit_stage1Result');
      if (s1) setStage1Result(JSON.parse(s1));

      const ar = sessionStorage.getItem('audit_auditReport');
      if (ar) setAuditReport(JSON.parse(ar));

      const ocr = sessionStorage.getItem('audit_currentOcrPayload');
      if (ocr) setCurrentOcrPayload(JSON.parse(ocr));

      const s2 = sessionStorage.getItem('audit_stage2JsonInput');
      if (s2) setStage2JsonInput(s2);

      const name = sessionStorage.getItem('audit_extractedCandidateName');
      if (name) setExtractedCandidateName(name);

      const mode = sessionStorage.getItem('audit_auditMode');
      if (mode === 'stage1' || mode === 'stage2' || mode === 'oneclick') {
        setAuditMode(mode);
      }
    } catch (e) {
      console.warn('Failed to hydrate audit session state:', e);
    }
  }, []);

  // Sync state to sessionStorage whenever it changes
  useEffect(() => {
    try {
      if (stage1Result) {
        sessionStorage.setItem('audit_stage1Result', JSON.stringify(stage1Result));
      } else {
        sessionStorage.removeItem('audit_stage1Result');
      }
    } catch (e) {}
  }, [stage1Result]);

  useEffect(() => {
    try {
      if (auditReport) {
        sessionStorage.setItem('audit_auditReport', JSON.stringify(auditReport));
      } else {
        sessionStorage.removeItem('audit_auditReport');
      }
    } catch (e) {}
  }, [auditReport]);

  useEffect(() => {
    try {
      if (currentOcrPayload) {
        sessionStorage.setItem('audit_currentOcrPayload', JSON.stringify(currentOcrPayload));
      } else {
        sessionStorage.removeItem('audit_currentOcrPayload');
      }
    } catch (e) {}
  }, [currentOcrPayload]);

  useEffect(() => {
    try {
      if (stage2JsonInput) {
        sessionStorage.setItem('audit_stage2JsonInput', stage2JsonInput);
      } else {
        sessionStorage.removeItem('audit_stage2JsonInput');
      }
    } catch (e) {}
  }, [stage2JsonInput]);

  useEffect(() => {
    try {
      if (extractedCandidateName) {
        sessionStorage.setItem('audit_extractedCandidateName', extractedCandidateName);
      } else {
        sessionStorage.removeItem('audit_extractedCandidateName');
      }
    } catch (e) {}
  }, [extractedCandidateName]);

  useEffect(() => {
    try {
      sessionStorage.setItem('audit_auditMode', auditMode);
    } catch (e) {}
  }, [auditMode]);

  // Clear / Reset audit state
  const handleClearAuditState = () => {
    setStage1Result(null);
    setAuditReport(null);
    setCurrentOcrPayload(null);
    setStage2JsonInput('');
    setExtractedCandidateName('');
    setFile(null);
    setUrl('');
    setErrorMessage(null);
    try {
      sessionStorage.removeItem('audit_stage1Result');
      sessionStorage.removeItem('audit_auditReport');
      sessionStorage.removeItem('audit_currentOcrPayload');
      sessionStorage.removeItem('audit_stage2JsonInput');
      sessionStorage.removeItem('audit_extractedCandidateName');
    } catch (e) {}
  };

  const hasResults = Boolean(stage1Result || auditReport);

  // Helper to extract candidate name dynamically from any response
  const extractNameFromPayload = (data: any): string => {
    if (!data) return file?.name?.replace(/\.[^/.]+$/, '') || 'Candidate Record';
    
    // Check direct candidate_name
    if (data.candidate_name) return data.candidate_name;
    
    // Check candidate ocr data list
    const firstCand = data.candidates_ocr_data?.[0];
    if (firstCand) {
      if (firstCand.candidate_name) return firstCand.candidate_name;
      if (firstCand.full_name) return firstCand.full_name;
      if (firstCand.extracted_fields?.full_name) return firstCand.extracted_fields.full_name;
      if (firstCand.extracted_fields?.name) return firstCand.extracted_fields.name;
    }

    // Check verified candidates list
    const firstVerified = data.verified_candidates?.[0];
    if (firstVerified) {
      if (firstVerified.candidate_file) return firstVerified.candidate_file.replace(/\.[^/.]+$/, '');
      if (firstVerified.candidate_name) return firstVerified.candidate_name;
    }

    // Check extracted fields directly
    if (data.extracted_fields?.full_name) return data.extracted_fields.full_name;
    if (data.extracted_fields?.name) return data.extracted_fields.name;

    return file?.name?.replace(/\.[^/.]+$/, '') || 'Candidate Record';
  };

  // Helper: extract best key-value OCR map from any Stage 1 response
  const extractOcrFieldsFromResponse = (res: any): Record<string, any> => {
    const firstCand = res?.candidates_ocr_data?.[0];
    let fields: Record<string, any> = {};

    if (firstCand?.extracted_fields && Object.keys(firstCand.extracted_fields).length > 0) {
      fields = { ...firstCand.extracted_fields };
    } else if (firstCand?.files?.length) {
      firstCand.files.forEach((f: any) => {
        if (f?.ocr_data && typeof f.ocr_data === 'object') {
          Object.assign(fields, f.ocr_data);
        }
      });
    } else if (firstCand?.ocr_data) {
      fields = { ...firstCand.ocr_data };
    } else if (res?.extracted_fields) {
      fields = { ...res.extracted_fields };
    } else if (firstCand) {
      fields = { ...firstCand };
    }
    return fields;
  };

  // Stage 1 OCR Handler
  const handleRunStage1 = async () => {
    if (!file && !url.trim()) {
      setErrorMessage('Please upload a candidate document file or provide a source URL.');
      return;
    }
    setErrorMessage(null);
    setLoading(true);
    try {
      const res = await api.stage1ExtractOCR(file || undefined, url || undefined);
      setStage1Result(res);
      const name = extractNameFromPayload(res);
      setExtractedCandidateName(name);

      // Task 2: Automatically save resulting extracted_fields into currentOcrPayload & pre-populate Stage 2 JSON editor
      const ocrFields = extractOcrFieldsFromResponse(res);
      setCurrentOcrPayload(ocrFields);
      setStage2JsonInput(JSON.stringify(ocrFields, null, 2));
    } catch (err: any) {
      console.error('Stage 1 Error:', err);
      const detail = err?.response?.data?.detail || err?.message || 'Failed to connect to FastAPI backend OCR engine.';
      setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  };

  // Stage 2 Verification Handler (Task 2: parses JSON editor content)
  const handleRunStage2 = async () => {
    setErrorMessage(null);
    setLoading(true);
    try {
      let ocrPayload: any = null;

      if (stage2JsonInput.trim()) {
        try {
          ocrPayload = JSON.parse(stage2JsonInput);
        } catch (jsonErr: any) {
          setErrorMessage(`Invalid JSON in Stage 2 Editor: ${jsonErr.message}`);
          setLoading(false);
          return;
        }
      } else if (currentOcrPayload) {
        ocrPayload = currentOcrPayload;
      } else {
        setErrorMessage('Please enter or paste OCR JSON payload in the editor, or click "Load Sample Data".');
        setLoading(false);
        return;
      }

      const res = await api.stage2VerifyGuidelines(ocrPayload);
      setAuditReport(res);
      const name = extractNameFromPayload(res) || extractedCandidateName || 'Candidate Record';
      setExtractedCandidateName(name);
    } catch (err: any) {
      console.error('Stage 2 Error:', err);
      const detail = err?.response?.data?.detail || err?.message || 'Failed to verify guidelines with FastAPI backend.';
      setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  };

  // 1-Click End-to-End Audit Handler (Task 4: calls /audit/1-click)
  const handleRunOneClickAudit = async () => {
    if (!file && !url.trim()) {
      setErrorMessage('Please upload a candidate document file or provide a source URL.');
      return;
    }
    setErrorMessage(null);
    setLoading(true);
    try {
      const res = await api.runOneClickAudit(file || undefined, url || undefined);

      // Task 4: Unified response — populate BOTH stage1 and audit results for side-by-side
      setAuditReport(res);

      // Expose OCR data from the unified payload into stage1Result for the Profile Card grid
      if (res?.candidates_ocr_data?.length) {
        setStage1Result({
          status: 'SUCCESS',
          candidates_ocr_data: res.candidates_ocr_data,
        } as any);

        const ocrFields = extractOcrFieldsFromResponse(res);
        setCurrentOcrPayload(ocrFields);
        setStage2JsonInput(JSON.stringify(ocrFields, null, 2));
      }

      const name = extractNameFromPayload(res);
      setExtractedCandidateName(name);
    } catch (err: any) {
      console.error('1-Click Audit Error:', err);
      const detail = err?.response?.data?.detail || err?.message || 'Failed to execute 1-click candidate audit.';
      setErrorMessage(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  };

  // Copy helper
  const copyRawJson = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // Safe extraction of key-value fields for Stage 1 Profile Card Grid
  const candidateOcrItem = stage1Result?.candidates_ocr_data?.[0];
  let extractedObj: Record<string, any> = {};

  if (candidateOcrItem?.extracted_fields && Object.keys(candidateOcrItem.extracted_fields).length > 0) {
    extractedObj = { ...candidateOcrItem.extracted_fields };
  } else if (candidateOcrItem?.files?.length) {
    candidateOcrItem.files.forEach((f: any) => {
      const docLabel = f?.label || 'Document';
      if (f?.ocr_data && typeof f.ocr_data === 'object') {
        if (!extractedObj[docLabel]) extractedObj[docLabel] = {};
        Object.assign(extractedObj[docLabel], f.ocr_data);
      }
    });
  } else if (candidateOcrItem?.ocr_data && typeof candidateOcrItem.ocr_data === 'object') {
    extractedObj = { ...candidateOcrItem.ocr_data };
  } else if (stage1Result?.extracted_fields) {
    extractedObj = { ...stage1Result.extracted_fields };
  } else if (typeof candidateOcrItem === 'object' && candidateOcrItem) {
    extractedObj = { ...candidateOcrItem };
  }

  // Safe extraction of rules/verdicts for Stage 2 / 1-Click
  // Unroll GuidelineVerdictItem (cleared_guidelines & uncleared_guidelines) into structured rules
  const verifiedCandidateItem = auditReport?.verified_candidates?.[0];
  const rawGuidelineList: any[] =
    verifiedCandidateItem?.guideline ||
    auditReport?.guideline ||
    auditReport?.rule_results ||
    auditReport?.results ||
    [];

  const ruleVerdicts: any[] = [];
  rawGuidelineList.forEach((item, itemIdx) => {
    if (item && typeof item === 'object') {
      if (Array.isArray(item.rules) && item.rules.length > 0) {
        item.rules.forEach((r: any) => {
          ruleVerdicts.push({
            rule_id: r.rule_id,
            rule_title: r.field_name || r.rule_title,
            status: r.status,
            matched: r.matched ?? (r.status === 'CLEARED'),
            evidence: r.evidence,
            reasoning: r.reasoning,
            recommendation: r.recommendation,
            document_label: r.document_label || item.document_label,
            document_id: r.document_id || item.id,
          });
        });
      } else if (Array.isArray(item.cleared_guidelines) || Array.isArray(item.uncleared_guidelines)) {
        (item.cleared_guidelines || []).forEach((ruleItem: any, rIdx: number) => {
          const ruleText = typeof ruleItem === 'string' ? ruleItem : (ruleItem?.reasoning || ruleItem?.field || JSON.stringify(ruleItem));
          const parts = ruleText.split('->');
          const docContext = item.document_label || (parts.length > 1 ? parts[0]?.trim() : undefined);
          const fieldName = parts.length > 1 ? parts[1]?.trim() : parts[0]?.trim() || ruleText;
          ruleVerdicts.push({
            rule_id: `CLEAR-${item.id || itemIdx}-${rIdx}`,
            rule_title: fieldName,
            status: 'CLEARED',
            matched: true,
            evidence: parts.length > 2 ? parts.slice(2).join('->').trim() : (parts.length > 1 ? parts[1].trim() : 'Condition verified in document'),
            reasoning: parts.length > 2 ? parts.slice(2).join('->').trim() : ruleText,
            document_label: docContext,
            document_id: item.id,
          });
        });
        (item.uncleared_guidelines || []).forEach((ruleItem: any, rIdx: number) => {
          const ruleText = typeof ruleItem === 'string' ? ruleItem : (ruleItem?.reasoning || ruleItem?.field || JSON.stringify(ruleItem));
          const parts = ruleText.split('->');
          const docContext = item.document_label || (parts.length > 1 ? parts[0]?.trim() : undefined);
          const fieldName = parts.length > 1 ? parts[1]?.trim() : parts[0]?.trim() || ruleText;
          ruleVerdicts.push({
            rule_id: `UNCLEAR-${item.id || itemIdx}-${rIdx}`,
            rule_title: fieldName,
            status: 'UNCLEARED',
            matched: false,
            evidence: parts.length > 2 ? parts.slice(2).join('->').trim() : 'Rule condition not satisfied or field missing',
            reasoning: parts.length > 2 ? parts.slice(2).join('->').trim() : ruleText,
            recommendation: `Check document quality or provide missing ${fieldName} on ${docContext || 'document'}.`,
            document_label: docContext,
            document_id: item.id,
          });
        });
      } else if (
        typeof item.status === 'string' ||
        typeof item.rule_title === 'string' ||
        typeof item.guideline_id === 'string'
      ) {
        ruleVerdicts.push(item);
      }
    }
  });

  const clearedRulesCount = ruleVerdicts.filter(
    (r) => r?.status === 'CLEARED' || r?.matched === true
  ).length;
  const unclearedRulesCount = ruleVerdicts.length - clearedRulesCount;
  const passRate = ruleVerdicts.length > 0 ? Math.round((clearedRulesCount / ruleVerdicts.length) * 100) : 100;
  const overallCleared = unclearedRulesCount === 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-32">
      
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/10 pb-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-500" />
            Audit & Execution Engine
          </h2>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Upload candidate documents to trigger AI OCR extraction, blueprint compliance, and guideline audits.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {hasResults && (
            <button
              onClick={handleClearAuditState}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
              title="Clear persisted audit results and start a fresh session"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset Results</span>
            </button>
          )}

          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Active Mode: <strong className="text-indigo-400 uppercase">{auditMode}</strong>
          </span>
        </div>
      </div>

      {/* ERROR ALERT BANNER */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-xs text-rose-300 hover:text-white font-bold ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* ================================================================ */}
      {/* WORKFLOW CONTROLS: SELECT PIPELINE -> UPLOAD -> EXECUTE */}
      {/* ================================================================ */}
      <div className={`p-6 rounded-2xl border ${
        isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        
        {/* PIPELINE MODE SELECTOR */}
        <div className="mb-6">
          <label className={`block text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            1. Select Pipeline Mode:
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            
            {/* MODE 1: Stage 1 */}
            <button
              onClick={() => { setAuditMode('stage1'); setErrorMessage(null); }}
              className={`p-4 rounded-xl border text-left transition-all relative ${
                auditMode === 'stage1'
                  ? isDark
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                    : 'bg-indigo-50 border-indigo-500 text-indigo-950 shadow-md'
                  : isDark
                  ? 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  Stage 1
                </span>
                <FileSearch className="w-4 h-4 text-indigo-400" />
              </div>
              <h4 className="text-sm font-bold">OCR Extraction Only</h4>
              <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Extracts fields from document &rarr; Displays Candidate Profile Card.
              </p>
            </button>

            {/* MODE 2: Stage 2 */}
            <button
              onClick={() => {
                setAuditMode('stage2');
                setErrorMessage(null);
                if (!stage2JsonInput.trim() && currentOcrPayload) {
                  setStage2JsonInput(JSON.stringify(currentOcrPayload, null, 2));
                } else if (!stage2JsonInput.trim()) {
                  setStage2JsonInput(JSON.stringify(SAMPLE_OCR_PAYLOAD, null, 2));
                }
              }}
              className={`p-4 rounded-xl border text-left transition-all relative ${
                auditMode === 'stage2'
                  ? isDark
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                    : 'bg-indigo-50 border-indigo-500 text-indigo-950 shadow-md'
                  : isDark
                  ? 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Stage 2
                </span>
                <Sliders className="w-4 h-4 text-blue-400" />
              </div>
              <h4 className="text-sm font-bold">Guideline Verification</h4>
              <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {currentOcrPayload ? '✨ Injects Stage 1 OCR' : 'Passes active OCR payload'} &rarr; Evaluates guidelines.
              </p>
            </button>

            {/* MODE 3: 1-Click Complete Audit */}
            <button
              onClick={() => { setAuditMode('oneclick'); setErrorMessage(null); }}
              className={`p-4 rounded-xl border text-left transition-all relative ${
                auditMode === 'oneclick'
                  ? isDark
                    ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10 ring-2 ring-indigo-500/30'
                    : 'bg-indigo-50 border-indigo-500 text-indigo-950 shadow-md ring-2 ring-indigo-500/20'
                  : isDark
                  ? 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  1-Click Audit
                </span>
                <Zap className="w-4 h-4 text-amber-400 fill-current" />
              </div>
              <h4 className="text-sm font-bold">End-to-End Pipeline</h4>
              <p className={`text-[11px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Extracts OCR and evaluates compliance rules in one single click.
              </p>
            </button>

          </div>
        </div>

        {/* 2. DOCUMENT INPUT (FILE OR CLOUD URL) — for Stage 1 & 1-Click */}
        {auditMode !== 'stage2' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200/10">
            <div>
              <label className={`block text-xs font-bold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                Candidate Document (.PDF / .ZIP / Image):
              </label>
              <div className={`p-4 border-2 border-dashed rounded-xl flex items-center justify-between ${
                isDark ? 'border-slate-800 bg-slate-950/50 hover:border-indigo-500' : 'border-slate-300 bg-slate-50 hover:border-indigo-500'
              }`}>
                <input
                  type="file"
                  onChange={(e) => {
                    const selected = e.target.files?.[0] || null;
                    setFile(selected);
                    if (selected) {
                      setExtractedCandidateName(selected.name.replace(/\.[^/.]+$/, ''));
                    }
                  }}
                  className="hidden"
                  id="audit-file-input"
                />
                <label htmlFor="audit-file-input" className="cursor-pointer flex items-center space-x-3 w-full">
                  <Upload className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                  <span className="text-xs font-medium truncate">
                    {file ? file.name : 'Choose candidate document or drop file here...'}
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label className={`block text-xs font-bold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                OR Public Document Cloud URL:
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://storage.company.com/candidates/doc.pdf"
                className={`w-full px-3.5 py-3 rounded-xl text-xs font-medium border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                  isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
            </div>
          </div>
        )}

        {/* 2b. STAGE 2 DEDICATED OCR JSON EDITOR */}
        {auditMode === 'stage2' && (
          <div className="pt-4 border-t border-slate-200/10 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label className={`block text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Candidate OCR Payload Editor (JSON):
                </label>
                <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {currentOcrPayload
                    ? '✨ Auto-populated from your Stage 1 OCR extraction. Modify or paste custom fields below.'
                    : 'Paste candidate OCR key-value data or click "Load Sample Data" to test compliance rules.'}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      if (stage2JsonInput.trim()) {
                        const parsed = JSON.parse(stage2JsonInput);
                        setStage2JsonInput(JSON.stringify(parsed, null, 2));
                      }
                    } catch (e) {
                      // ignore
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    isDark ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700' : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Format JSON
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStage2JsonInput(JSON.stringify(SAMPLE_OCR_PAYLOAD, null, 2));
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    isDark ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-400 hover:bg-indigo-900/50' : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                  }`}
                >
                  Load Sample Data
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (stage2JsonInput) {
                      navigator.clipboard.writeText(stage2JsonInput);
                      setCopiedJson(true);
                      setTimeout(() => setCopiedJson(false), 2000);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-all ${
                    isDark ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white' : 'bg-slate-100 border-slate-300 text-slate-700'
                  }`}
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedJson ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <textarea
              rows={12}
              value={stage2JsonInput}
              onChange={(e) => setStage2JsonInput(e.target.value)}
              placeholder="Enter or paste candidate OCR key-value data..."
              className={`w-full p-4 rounded-xl font-mono text-xs border focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${
                isDark ? 'bg-slate-950 border-slate-800 text-blue-300' : 'bg-slate-900 border-slate-800 text-blue-200'
              }`}
            />
          </div>
        )}

        {/* 3. EXECUTE ACTION BUTTONS */}
        <div className="mt-6 flex justify-end">
          {auditMode === 'stage1' && (
            <button
              onClick={handleRunStage1}
              disabled={loading}
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center space-x-2 disabled:opacity-50"
            >
              <FileSearch className="w-4 h-4" />
              <span>Execute Stage 1 OCR Extraction</span>
            </button>
          )}

          {auditMode === 'stage2' && (
            <button
              onClick={handleRunStage2}
              disabled={loading}
              className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition-all flex items-center space-x-2 disabled:opacity-50"
            >
              <Sliders className="w-4 h-4" />
              <span>Execute Stage 2 Guideline Verification</span>
            </button>
          )}

          {auditMode === 'oneclick' && (
            <button
              onClick={handleRunOneClickAudit}
              disabled={loading}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-extrabold text-xs shadow-xl shadow-indigo-500/25 transition-all flex items-center space-x-2 disabled:opacity-50"
            >
              <Zap className="w-4 h-4 fill-current text-amber-300" />
              <span>Launch 1-Click Complete Candidate Audit</span>
            </button>
          )}
        </div>

        {/* ====================================================== */}
        {/* TASK 3: 4-PHASE OCR LOADING ANIMATION PANEL             */}
        {/* ====================================================== */}
        {loading && (
          <div className={`mt-6 p-6 rounded-2xl border animate-in fade-in duration-300 ${
            isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-indigo-50/60 border-indigo-200'
          }`}>
            <div className="flex flex-col items-center gap-5">
              {/* Pulsing Icon */}
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-3xl animate-pulse">
                  {OCR_PHASES[ocrPhase]?.icon}
                </div>
                <div className="absolute -inset-1.5 rounded-3xl border-2 border-indigo-500/20 animate-ping" />
              </div>

              {/* Phase label with fade transition */}
              <div className="text-center">
                <p className="text-sm font-extrabold tracking-tight text-indigo-400 transition-all duration-700">
                  {OCR_PHASES[ocrPhase]?.label}
                </p>
                <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Processing candidate documents via Neural-OCR-Engine...
                </p>
              </div>

              {/* Step progress bar */}
              <div className="w-full max-w-sm">
                <div className="flex justify-between text-[10px] font-semibold mb-2 text-slate-400">
                  {OCR_PHASES.map((_, i) => (
                    <span
                      key={i}
                      className={`transition-colors duration-500 ${
                        i <= ocrPhase ? 'text-indigo-400' : ''
                      }`}
                    >
                      Step {i + 1}
                    </span>
                  ))}
                </div>
                <div className={`w-full h-2.5 rounded-full overflow-hidden ${
                  isDark ? 'bg-slate-800' : 'bg-indigo-200/50'
                }`}>
                  <div
                    className="h-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-700 ease-out"
                    style={{ width: `${OCR_PHASES[ocrPhase]?.progress ?? 10}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* 2 & 3. RESULTS SECTION (STACKED SINGLE-COLUMN FLOW)             */}
      {/* ================================================================ */}
      {((stage1Result && (auditMode === 'stage1' || auditMode === 'oneclick')) ||
        (auditReport && (auditMode === 'stage2' || auditMode === 'oneclick'))) && (
        <div className="w-full max-w-full overflow-hidden">
          <div className="flex flex-col gap-6 pt-4 w-full max-w-full">
            {stage1Result && (auditMode === 'stage1' || auditMode === 'oneclick') && (
              <div className={`p-6 rounded-2xl border space-y-6 w-full max-w-full overflow-hidden ${
                isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}>
            
            {/* HEADER WITH DYNAMIC CANDIDATE NAME & DUAL-VIEW TOGGLE */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/10 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Extracted Candidate Profile
                  </span>
                  <h3 className="text-lg font-extrabold tracking-tight flex items-center gap-2">
                    {extractedCandidateName || 'Candidate Document'}
                    {Boolean(candidateOcrItem?.confidence_score ?? stage1Result.confidence_score) && (
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Confidence: {candidateOcrItem?.confidence_score ?? stage1Result.confidence_score}%
                      </span>
                    )}
                  </h3>
                </div>
              </div>

              {/* DUAL-VIEW TOGGLE */}
              <div className={`p-1 rounded-xl border flex space-x-1 ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}>
                <button
                  onClick={() => setStage1ViewMode('ui')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    stage1ViewMode === 'ui'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Human-Friendly Profile Card
                </button>
                <button
                  onClick={() => setStage1ViewMode('json')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    stage1ViewMode === 'json'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  Raw JSON
                </button>
              </div>
            </div>

            {/* VIEW 1: HUMAN-FRIENDLY CANDIDATE PROFILE GRID */}
            {stage1ViewMode === 'ui' && (
              <CandidateProfileCard
                extractedData={extractedObj}
                candidateName={extractedCandidateName}
                confidenceScore={candidateOcrItem?.confidence_score ?? stage1Result.confidence_score}
                rawOcrText={candidateOcrItem?.raw_ocr_text || stage1Result.raw_ocr_text}
                isDark={isDark}
              />
            )}

          {/* VIEW 2: RAW JSON INSPECTOR */}
          {stage1ViewMode === 'json' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  onClick={() => copyRawJson(stage1Result)}
                  className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 ${
                    isDark ? 'bg-slate-950 border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedJson ? 'Copied!' : 'Copy Raw JSON'}</span>
                </button>
              </div>
              <div className={`p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-[350px] ${
                isDark ? 'bg-slate-950 border border-slate-800 text-emerald-300' : 'bg-slate-900 border border-slate-800 text-emerald-200'
              }`}>
                <pre>{JSON.stringify(stage1Result, null, 2)}</pre>
              </div>
            </div>
          )}

        </div>
      )}

          {/* 3. STAGE 2 & 1-CLICK: DYNAMIC COMPLIANCE RESULTS */}
          {auditReport && (auditMode === 'stage2' || auditMode === 'oneclick') && (
            <div className="space-y-6">
          
          {/* OVERVIEW RESULT CARD */}
          <div className={`p-6 rounded-2xl border transition-all ${
            overallCleared
              ? isDark
                ? 'bg-emerald-950/20 border-emerald-500/30'
                : 'bg-emerald-50/90 border-emerald-200'
              : isDark
              ? 'bg-rose-950/20 border-rose-500/30'
              : 'bg-rose-50/90 border-rose-200'
          }`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center space-x-3 min-w-0">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold shadow-lg flex-shrink-0 ${
                  overallCleared
                    ? 'bg-emerald-500 text-white shadow-emerald-500/25'
                    : 'bg-rose-500 text-white shadow-rose-500/25'
                }`}>
                  {overallCleared ? <CheckCircle2 className="w-7 h-7" /> : <XCircle className="w-7 h-7" />}
                </div>

                <div className="min-w-0">
                  <span className="text-xs uppercase font-extrabold tracking-widest text-slate-400">
                    Compliance Verification Verdict
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2 sm:gap-3 flex-wrap">
                    <span>Candidate:</span> <span className="underline decoration-indigo-500/50 truncate max-w-md">{extractedCandidateName || 'Evaluated Profile'}</span>
                    <span className={`text-xs px-3 py-1 rounded-full font-black tracking-wider uppercase border whitespace-nowrap flex-shrink-0 ${
                      overallCleared
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                    }`}>
                      {overallCleared ? 'CLEARED' : 'UNCLEARED'}
                    </span>
                  </h3>
                </div>
              </div>

              {/* STAT COUNTERS */}
              <div className="flex items-center space-x-3 flex-shrink-0">
                <div className={`p-3 rounded-xl border text-center min-w-24 ${
                  isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Cleared</span>
                  <span className="text-xl font-extrabold text-emerald-400">{clearedRulesCount}</span>
                </div>

                <div className={`p-3 rounded-xl border text-center min-w-24 ${
                  isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Uncleared</span>
                  <span className={`text-xl font-extrabold ${unclearedRulesCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                    {unclearedRulesCount}
                  </span>
                </div>

                <div className={`p-3 rounded-xl border text-center min-w-24 ${
                  isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Pass Rate</span>
                  <span className="text-xl font-extrabold text-indigo-400">{passRate}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* DUAL-VIEW TOGGLE */}
          <div className="flex items-center justify-between border-b border-slate-200/10 pb-4">
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Results Display Format:
            </span>

            <div className={`p-1 rounded-xl border flex space-x-1 ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                onClick={() => setResultsViewMode('text')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  resultsViewMode === 'text'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Human-Friendly Text View (Default)
              </button>

              <button
                onClick={() => setResultsViewMode('json')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  resultsViewMode === 'json'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                Raw Backend JSON View
              </button>
            </div>
          </div>

          {/* HUMAN-FRIENDLY RULE VERDICTS */}
          {resultsViewMode === 'text' && (
            <div className="space-y-4 w-full">
              <h4 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Evaluated Compliance Guidelines ({ruleVerdicts.length}):
              </h4>
              <GuidelineResults rules={ruleVerdicts} isDark={isDark} />
            </div>
          )}

          {/* RAW JSON VIEW */}
          {resultsViewMode === 'json' && (
            <div className={`p-5 rounded-2xl border space-y-3 ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Code2 className="w-4 h-4 text-indigo-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">
                    Raw FastAPI Audit Response
                  </h4>
                </div>

                <button
                  onClick={() => copyRawJson(auditReport)}
                  className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 ${
                    isDark ? 'bg-slate-950 border-slate-800 hover:bg-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedJson ? 'Copied!' : 'Copy Response'}</span>
                </button>
              </div>

              <div className={`p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-[450px] ${
                isDark ? 'bg-slate-950 border border-slate-800 text-emerald-300' : 'bg-slate-900 border border-slate-800 text-emerald-200'
              }`}>
                <pre>{JSON.stringify(auditReport, null, 2)}</pre>
              </div>
            </div>
          )}

        </div>
      )}

          </div>
        </div>
      )}

    </div>
  );
};

export default AuditEngine;
