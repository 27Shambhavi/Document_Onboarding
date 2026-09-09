import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../App';
import { api } from '../api/client';
import type { DocumentScan } from '../api/client';
import {
  FileText,
  Users,
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  Sliders,
  FileSearch,
  Copy,
  Check,
  Code2,
  Tag,
} from 'lucide-react';
import { CandidateProfileCard } from '../components/audit/CandidateProfileCard';
import { GuidelineResults } from '../components/audit/GuidelineResults';

export const HomeDashboard: React.FC = () => {
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [totalDocs, setTotalDocs] = useState<number>(0);
  const [totalCandidates, setTotalCandidates] = useState<number>(0);
  const [recentAudits, setRecentAudits] = useState<DocumentScan[]>([]);

  // Drill-down modal state (Task 3: Profile View, Guideline Audit, Developer JSON)
  const [selectedScan, setSelectedScan] = useState<DocumentScan | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [modalViewMode, setModalViewMode] = useState<'profile' | 'guideline' | 'json'>('profile');
  const [jsonSubTab, setJsonSubTab] = useState<'extracted' | 'guideline'>('extracted');
  const [copiedJson, setCopiedJson] = useState(false);

  const copyModalJson = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // Helper to extract clean attributes & metadata for Profile View & Guideline Audit
  const parseScanPayload = (
    rawJson: any,
    scanFilename?: string,
    scanId?: number,
    scanObj?: DocumentScan | null
  ) => {
    if (!rawJson || typeof rawJson !== 'object') {
      return {
        candidateName: scanFilename?.replace(/\.[^/.]+$/, '') || 'Candidate Record',
        requestId: `REQ-${scanId ?? '00'}`,
        detectedDocs: [],
        fields: [],
        mergedFields: {},
        guidelineVerdicts: [],
        totalRules: 0,
        clearedCount: 0,
        unclearedCount: 0,
        passRate: 0,
        overallCleared: false,
      };
    }

    // 1. Candidate Name
    let name =
      rawJson.candidate_name ||
      rawJson.full_name ||
      rawJson.extracted_fields?.full_name ||
      rawJson.extracted_fields?.candidate_name ||
      rawJson.extracted_fields?.name ||
      rawJson.extracted_fields?.['Candidate Name'] ||
      rawJson.candidates_ocr_data?.[0]?.candidate_name ||
      rawJson.candidates_ocr_data?.[0]?.extracted_fields?.['Candidate Name'] ||
      rawJson.candidates_ocr_data?.[0]?.extracted_fields?.name ||
      rawJson.candidate_file?.replace(/\.[^/.]+$/, '') ||
      scanFilename?.replace(/\.[^/.]+$/, '') ||
      'Candidate Record';

    // 2. Request / Customer ID
    const reqId =
      rawJson.requestId ||
      rawJson.candidates_ocr_data?.[0]?.requestId ||
      `REQ-${scanId ?? '00'}`;

    // 3. Detected Documents
    const detectedDocs: Array<{ id: string; label: string; fieldCount: number }> = [];
    const filesList =
      rawJson.files ||
      rawJson.candidates_ocr_data?.[0]?.files ||
      rawJson.documents ||
      [];

    if (Array.isArray(filesList)) {
      filesList.forEach((f: any, idx: number) => {
        if (f && typeof f === 'object') {
          const ocrCount = f.ocr_data && typeof f.ocr_data === 'object' ? Object.keys(f.ocr_data).length : 0;
          detectedDocs.push({
            id: f.id || `DOC-${idx + 1}`,
            label: f.label || 'Document',
            fieldCount: ocrCount,
          });
        }
      });
    }

    // 4. Key-Value Field Entries
    const mergedFields: Record<string, any> = {};

    if (rawJson.extracted_fields && typeof rawJson.extracted_fields === 'object') {
      Object.assign(mergedFields, rawJson.extracted_fields);
    } else if (Array.isArray(filesList) && filesList.length > 0) {
      filesList.forEach((f: any) => {
        const docLabel = f?.label || 'Document';
        if (f?.ocr_data && typeof f.ocr_data === 'object') {
          if (!mergedFields[docLabel]) mergedFields[docLabel] = {};
          Object.assign(mergedFields[docLabel], f.ocr_data);
        }
      });
    }

    // Direct key-values in rawJson
    Object.entries(rawJson).forEach(([k, v]) => {
      if (
        typeof v !== 'object' &&
        ![
          'raw_ocr_text',
          'ocr_text',
          'files',
          'candidate_file',
          'requestId',
          'customer_id',
          'total_documents_detected',
          'guideline',
          'rule_results',
          'failures',
          'candidates_ocr_data',
          'verified_candidates',
          'confidence_score',
          'status',
          'company_id',
          'total_candidates',
          'total_candidates_processed',
          'total_guidelines_evaluated',
          'rules_by_document',
          'grouped_guidelines',
        ].includes(k)
      ) {
        if (!mergedFields[k]) {
          mergedFields[k] = v;
        }
      }
    });

    const fields = Object.entries(mergedFields).filter(
      ([k, v]) =>
        typeof v !== 'object' &&
        !['raw_ocr_text', 'ocr_text', 'candidate_file', 'requestId', 'customer_id', 'total_documents_detected'].includes(k)
    );

    // 5. Guideline Verdicts (if 1-click, Stage 2 scan, or persisted guidelines in DB)
    const guidelineVerdicts: any[] = [];

    const pushRule = (r: any, fallbackDocLabel?: string, idxKey?: string | number) => {
      if (!r || typeof r !== 'object') return;
      const docLabel = r.document_label || fallbackDocLabel;
      const title = r.field_name || r.rule_title || r.title || 'Guideline Requirement';
      const isCleared = r.status === 'CLEARED' || r.matched === true;
      guidelineVerdicts.push({
        id: r.rule_id || r.id || `rule-${idxKey ?? guidelineVerdicts.length}`,
        title: title,
        rule_title: title,
        document_label: docLabel,
        evidence: r.evidence || (isCleared ? 'Requirement verified successfully.' : 'Missing or invalid requirement.'),
        reasoning: r.reasoning || r.explanation || (isCleared ? `Condition satisfied for ${title}.` : `Verification failed for ${title}.`),
        recommendation: r.recommendation,
        status: r.status || (isCleared ? 'CLEARED' : 'UNCLEARED'),
        matched: isCleared,
        passed: isCleared,
      });
    };

    // A. Check rules_by_document (dict of docLabel -> array of rules)
    const rulesByDoc = scanObj?.rules_by_document || rawJson.rules_by_document || rawJson.verified_candidates?.[0]?.rules_by_document;
    if (rulesByDoc && typeof rulesByDoc === 'object' && !Array.isArray(rulesByDoc)) {
      Object.entries(rulesByDoc).forEach(([docLabel, rules]) => {
        if (Array.isArray(rules)) {
          rules.forEach((r, idx) => pushRule(r, docLabel, `${docLabel}-${idx}`));
        }
      });
    }

    // B. Check grouped_guidelines (dict of docLabel -> { rules: [...] })
    const groupedGuidelines = scanObj?.grouped_guidelines || rawJson.grouped_guidelines || rawJson.verified_candidates?.[0]?.grouped_guidelines;
    if (guidelineVerdicts.length === 0 && groupedGuidelines && typeof groupedGuidelines === 'object' && !Array.isArray(groupedGuidelines)) {
      Object.entries(groupedGuidelines).forEach(([docLabel, groupVal]: [string, any]) => {
        if (groupVal && Array.isArray(groupVal.rules)) {
          groupVal.rules.forEach((r: any, idx: number) => pushRule(r, docLabel, `${docLabel}-${idx}`));
        }
      });
    }

    // C. Check raw guidelines array
    if (guidelineVerdicts.length === 0) {
      const rawGuidelines =
        scanObj?.guideline ||
        rawJson.guideline ||
        rawJson.verified_candidates?.[0]?.guideline ||
        rawJson.results?.[0]?.guideline ||
        rawJson.rule_results ||
        [];

      if (Array.isArray(rawGuidelines)) {
        rawGuidelines.forEach((item: any, gIdx: number) => {
          if (item && typeof item === 'object') {
            if (Array.isArray(item.rules) && item.rules.length > 0) {
              item.rules.forEach((r: any, rIdx: number) => {
                pushRule(r, item.document_label, `${gIdx}-${rIdx}`);
              });
            } else if (item.rule_id || item.rule_title || item.status) {
              // Direct flat rule object
              pushRule(item, item.document_label, gIdx);
            } else {
              // Unroll cleared_guidelines
              if (Array.isArray(item.cleared_guidelines)) {
                item.cleared_guidelines.forEach((ruleItem: any, idx: number) => {
                  const str = typeof ruleItem === 'string' ? ruleItem : (ruleItem?.reasoning || ruleItem?.field || JSON.stringify(ruleItem));
                  const parts = str.split('->');
                  const docContext = item.document_label || (parts.length > 1 ? parts[0]?.trim() : undefined);
                  const fieldName = parts.length > 1 ? parts[1]?.trim() : parts[0]?.trim() || str;
                  guidelineVerdicts.push({
                    id: `pass-${gIdx}-${idx}`,
                    title: fieldName,
                    rule_title: fieldName,
                    document_label: docContext,
                    evidence: parts.length > 2 ? parts.slice(2).join('->').trim() : (parts.length > 1 ? parts[1].trim() : 'Requirement verified successfully.'),
                    reasoning: parts.length > 2 ? parts.slice(2).join('->').trim() : str,
                    status: 'CLEARED',
                    matched: true,
                    passed: true,
                  });
                });
              }
              // Unroll uncleared_guidelines
              if (Array.isArray(item.uncleared_guidelines)) {
                item.uncleared_guidelines.forEach((ruleItem: any, idx: number) => {
                  const str = typeof ruleItem === 'string' ? ruleItem : (ruleItem?.reasoning || ruleItem?.field || JSON.stringify(ruleItem));
                  const parts = str.split('->');
                  const docContext = item.document_label || (parts.length > 1 ? parts[0]?.trim() : undefined);
                  const fieldName = parts.length > 1 ? parts[1]?.trim() : parts[0]?.trim() || str;
                  guidelineVerdicts.push({
                    id: `fail-${gIdx}-${idx}`,
                    title: fieldName,
                    rule_title: fieldName,
                    document_label: docContext,
                    evidence: parts.length > 2 ? parts.slice(2).join('->').trim() : 'Missing or invalid requirement.',
                    reasoning: parts.length > 2 ? parts.slice(2).join('->').trim() : str,
                    status: 'UNCLEARED',
                    matched: false,
                    passed: false,
                  });
                });
              }
            }
          }
        });
      }
    }

    const totalRules = guidelineVerdicts.length;
    const clearedCount = guidelineVerdicts.filter((v) => v.passed || v.status === 'CLEARED').length;
    const unclearedCount = totalRules - clearedCount;
    const passRate = totalRules > 0 ? Math.round((clearedCount / totalRules) * 100) : 0;
    const overallCleared = totalRules > 0 && unclearedCount === 0;

    return {
      candidateName: name,
      requestId: reqId,
      detectedDocs,
      fields,
      mergedFields,
      guidelineVerdicts,
      totalRules,
      clearedCount,
      unclearedCount,
      passRate,
      overallCleared,
    };
  };

  useEffect(() => {
    let isMounted = true;

    const fetchRealData = async () => {
      setLoading(true);

      // 1. Fetch scan history from PostgreSQL (Task 1) — persists across page refreshes
      try {
        const scansRes = await api.getCompanyScans(20);
        if (isMounted) {
          const scans = scansRes.scans || [];
          setTotalDocs(scans.length);                              // Distinct scan records
          setTotalCandidates(scansRes.total_pages_scanned ?? 0);   // Total pages processed
          setRecentAudits(scans);
        }
      } catch {
        // No scans yet — stays 0
      }

      if (isMounted) setLoading(false);
    };

    fetchRealData();
    return () => { isMounted = false; };
  }, []);

  const handleScanClick = async (scan: DocumentScan) => {
    setLoadingDetail(true);
    setModalViewMode('profile');
    setJsonSubTab('extracted');
    setCopiedJson(false);
    setSelectedScan(scan); // show panel immediately with skeleton
    try {
      const detail = await api.getScanDetail(scan.id);
      setSelectedScan(detail);
    } catch (err) {
      console.error('Failed to fetch scan detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* 1. WELCOME HERO BANNER */}
      <div
        className={`relative overflow-hidden rounded-3xl p-6 md:p-8 border transition-all ${
          isDark
            ? 'bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-slate-800 shadow-2xl shadow-indigo-950/20'
            : 'bg-gradient-to-r from-indigo-900 via-indigo-800 to-blue-900 text-white border-indigo-700 shadow-xl'
        }`}
      >
        <div className="absolute -right-12 -top-12 w-64 h-64 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
        <div className="absolute right-48 -bottom-12 w-48 h-48 rounded-full bg-blue-500/20 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight leading-tight">
              AI-Powered Document Onboarding &amp; Rule Verification
            </h2>

            <p className={`text-sm md:text-base leading-relaxed ${isDark ? 'text-slate-300' : 'text-indigo-100'}`}>
              DocVerify automates candidate document extraction, blueprint validation, and multi-stage compliance auditing. Scan government IDs, passports, and tax forms with real-time accuracy scoring.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate('/audit')}
                className="px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-sm shadow-lg shadow-indigo-500/30 transition-all flex items-center space-x-2 group cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-current text-amber-300" />
                <span>Launch 1-Click Audit Engine</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                onClick={() => navigate('/config')}
                className={`px-5 py-2.5 rounded-xl font-semibold text-sm border transition-all flex items-center space-x-2 cursor-pointer ${
                  isDark
                    ? 'bg-slate-900/80 hover:bg-slate-800 border-slate-700 text-slate-200'
                    : 'bg-white/10 hover:bg-white/20 border-white/20 text-white backdrop-blur-sm'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>Configure OCR Blueprint</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. DYNAMIC METRICS GRID — DB-BACKED, PERSISTS ACROSS REFRESHES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* STAT 1: Total Docs Uploaded */}
        <div className={`p-6 rounded-2xl border transition-all ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold tracking-wider uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Total Documents Uploaded
            </span>
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold tracking-tight">
              {loading ? (
                <span className="inline-block w-16 h-8 bg-slate-700/30 animate-pulse rounded" />
              ) : (
                totalDocs.toLocaleString()
              )}
            </span>
            <span className="text-xs font-semibold text-indigo-400">Logged in DB</span>
          </div>
          <p className={`text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Distinct scans persisted to PostgreSQL
          </p>
        </div>

        {/* STAT 2: Candidates Processed (total pages) */}
        <div className={`p-6 rounded-2xl border transition-all ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold tracking-wider uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Candidates Processed
            </span>
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold tracking-tight">
              {loading ? (
                <span className="inline-block w-16 h-8 bg-slate-700/30 animate-pulse rounded" />
              ) : (
                totalCandidates.toLocaleString()
              )}
            </span>
            <span className="text-xs font-semibold text-blue-400">Total Pages</span>
          </div>
          <p className={`text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Pages scanned across all audit runs
          </p>
        </div>

      </div>

      {/* 3. RECENT AUDIT HISTORY (DB-BACKED — CLICKABLE) & ARCHITECTURE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* RECENT AUDITS FEED */}
        <div className={`lg:col-span-2 p-6 rounded-2xl border ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold tracking-tight">Recent Candidate Audits</h3>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Click any row to view the saved OCR JSON from PostgreSQL
              </p>
            </div>
            <button
              onClick={() => navigate('/audit')}
              className="text-xs font-semibold text-indigo-500 hover:text-indigo-400 flex items-center gap-1"
            >
              <span>Go to Audit Engine</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentAudits.length > 0 ? (
            <div className="space-y-3">
              {recentAudits.map((scan) => (
                <button
                  key={scan.id}
                  onClick={() => handleScanClick(scan)}
                  className={`w-full p-4 rounded-xl border transition-all text-left flex items-center justify-between group ${
                    isDark
                      ? 'bg-slate-950/60 border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900'
                      : 'bg-slate-50/80 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold truncate">{scan.filename}</h4>
                        {scan.has_guidelines && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 flex-shrink-0">
                            Guideline Audit
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">
                        {scan.pages_count} {scan.pages_count === 1 ? 'page' : 'pages'} · ₹{scan.cost_inr.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {new Date(scan.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className={`p-8 rounded-2xl border text-center space-y-3 ${
              isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center mx-auto">
                <FileSearch className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold">No Candidate Audits Logged Yet</h4>
                <p className={`text-xs max-w-sm mx-auto mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Upload candidate IDs, passports, or document bundles in the Audit Engine to generate live compliance verification streams.
                </p>
              </div>
              <button
                onClick={() => navigate('/audit')}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all inline-flex items-center gap-1.5"
              >
                <span>Launch First Candidate Audit</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ARCHITECTURE WORKFLOW STEPS */}
        <div className={`p-6 rounded-2xl border flex flex-col justify-between ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div>
            <h3 className="text-lg font-bold tracking-tight mb-1">Architecture Pipeline</h3>
            <p className={`text-xs mb-6 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              End-to-end multi-layer verification steps
            </p>

            <div className="space-y-4">
              {[
                { n: '1', title: 'OCR Blueprint Extraction', desc: 'Normalizes identity scans against registered JSON target schemas.' },
                { n: '2', title: 'Guideline Reasoning Engine', desc: 'Evaluates rule conditions against candidate OCR payloads.' },
                { n: '3', title: 'DB Persistence & Human UI', desc: 'Every scan persisted to PostgreSQL. Dual-view reporting with Profile Card grids.' },
              ].map(({ n, title, desc }) => (
                <div key={n} className="flex items-start space-x-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                    {n}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold">{title}</h4>
                    <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200/10 mt-6">
            <button
              onClick={() => navigate('/config')}
              className={`w-full py-2.5 px-4 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                isDark
                  ? 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-200'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
              }`}
            >
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>Manage Compliance Guidelines</span>
            </button>
          </div>
        </div>

      </div>

      {/* ============================================================ */}
      {/* SCAN DETAIL SLIDE-OVER MODAL (extracted_json drill-down)      */}
      {/* ============================================================ */}
      {selectedScan && (() => {
        const parsedPayload = parseScanPayload(
          selectedScan.extracted_json,
          selectedScan.filename,
          selectedScan.id,
          selectedScan
        );

        // Active JSON to show and copy in Developer JSON view
        const guidelineJsonData =
          selectedScan.rules_by_document && Object.keys(selectedScan.rules_by_document).length > 0
            ? selectedScan.rules_by_document
            : selectedScan.guideline && selectedScan.guideline.length > 0
            ? selectedScan.guideline
            : selectedScan.grouped_guidelines && Object.keys(selectedScan.grouped_guidelines).length > 0
            ? selectedScan.grouped_guidelines
            : parsedPayload.guidelineVerdicts.length > 0
            ? parsedPayload.guidelineVerdicts
            : null;

        const activeJsonPayload =
          jsonSubTab === 'guideline' && guidelineJsonData
            ? guidelineJsonData
            : selectedScan.extracted_json;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              {/* Header */}
              <div className={`flex flex-col sm:flex-row sm:items-center justify-between p-6 border-b gap-4 flex-shrink-0 ${
                isDark ? 'border-slate-800' : 'border-slate-200'
              }`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className={`text-base font-bold truncate flex items-center gap-2 ${
                      isDark ? 'text-white' : 'text-slate-900'
                    }`}>
                      <span>{parsedPayload.candidateName}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-semibold ${
                        isDark ? 'bg-slate-800 text-slate-300 border border-slate-700' : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        #{selectedScan.id}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {selectedScan.filename} · {selectedScan.pages_count} {selectedScan.pages_count === 1 ? 'page' : 'pages'} · ₹{selectedScan.cost_inr.toFixed(2)}
                      {selectedScan.created_at && ` · ${new Date(selectedScan.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                  </div>
                </div>

                {/* 3-Way Toggle Switcher & Close button */}
                <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                  <div className={`p-1 rounded-xl border flex space-x-1 ${
                    isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                  }`}>
                    {/* 1. Profile View */}
                    <button
                      onClick={() => setModalViewMode('profile')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        modalViewMode === 'profile'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Profile View</span>
                    </button>

                    {/* 2. Guideline Audit */}
                    <button
                      onClick={() => setModalViewMode('guideline')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        modalViewMode === 'guideline'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Guideline Audit</span>
                      {parsedPayload.totalRules > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                          modalViewMode === 'guideline'
                            ? 'bg-white/20 text-white'
                            : parsedPayload.overallCleared
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                        }`}>
                          {parsedPayload.totalRules}
                        </span>
                      )}
                    </button>

                    {/* 3. Developer JSON */}
                    <button
                      onClick={() => setModalViewMode('json')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        modalViewMode === 'json'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span>Developer JSON</span>
                    </button>
                  </div>

                  <button
                    onClick={() => setSelectedScan(null)}
                    className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                      isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                    title="Close modal"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-auto p-6 space-y-6">
                {loadingDetail ? (
                  <div className="flex flex-col items-center justify-center h-48 gap-3 text-indigo-400">
                    <div className="w-8 h-8 border-2 border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin" />
                    <span className="text-sm font-medium">Loading scan payload from PostgreSQL...</span>
                  </div>
                ) : modalViewMode === 'profile' ? (
                  /* ============================================================ */
                  /* 1. OCR PROFILE VIEW                                          */
                  /* ============================================================ */
                  !selectedScan.extracted_json ? (
                    <div className="text-center text-slate-400 py-12 text-sm">
                      No extracted JSON payload available for this scan record.
                    </div>
                  ) : (
                    <div className="space-y-6 animate-in fade-in duration-200">
                      {/* Summary Strip */}
                      <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
                        isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-indigo-50/50 border-indigo-100'
                      }`}>
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Request ID:</span>
                          <span className="text-xs font-mono font-bold text-indigo-500 dark:text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                            {parsedPayload.requestId}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">Extracted Attributes:</span>
                          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {parsedPayload.fields.length} {parsedPayload.fields.length === 1 ? 'field' : 'fields'}
                          </span>
                        </div>
                      </div>

                      {/* Quick Guideline Verdict Link Banner (if guideline results exist) */}
                      {parsedPayload.totalRules > 0 && (
                        <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                          parsedPayload.overallCleared
                            ? isDark ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-emerald-50/70 border-emerald-200'
                            : isDark ? 'bg-rose-950/20 border-rose-800/40' : 'bg-rose-50/70 border-rose-200'
                        }`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                              parsedPayload.overallCleared
                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                            }`}>
                              {parsedPayload.overallCleared ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <h5 className="text-xs font-bold flex items-center gap-2 flex-wrap">
                                <span className={isDark ? 'text-slate-200' : 'text-slate-800'}>Compliance Verdict:</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                  parsedPayload.overallCleared
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-rose-600 text-white'
                                }`}>
                                  {parsedPayload.overallCleared ? 'CLEARED' : 'UNCLEARED'} ({parsedPayload.passRate}% Pass)
                                </span>
                              </h5>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {parsedPayload.clearedCount} of {parsedPayload.totalRules} evaluated compliance conditions satisfied.
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setModalViewMode('guideline')}
                            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 flex-shrink-0 cursor-pointer"
                          >
                            <span>Open Guideline Audit</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Detected Document Classification Badges */}
                      {parsedPayload.detectedDocs.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                            <span>Detected Documents</span>
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {parsedPayload.detectedDocs.map((doc, idx) => (
                              <div
                                key={idx}
                                className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                                  isDark
                                    ? 'bg-slate-950/80 border-slate-800 text-slate-300'
                                    : 'bg-slate-50 border-slate-200 text-slate-700'
                                }`}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                <span className="font-bold">{doc.label}</span>
                                <span className="text-[10px] opacity-60 font-mono">({doc.id})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Extracted Key-Value Fields Sectional Card */}
                      <div className="space-y-2.5">
                        <CandidateProfileCard
                          extractedData={parsedPayload.mergedFields}
                          candidateName={parsedPayload.candidateName}
                          isDark={isDark}
                        />
                      </div>
                    </div>
                  )
                ) : modalViewMode === 'guideline' ? (
                  /* ============================================================ */
                  /* 2. GUIDELINE COMPLIANCE & REASONING RESULTS                  */
                  /* ============================================================ */
                  parsedPayload.totalRules === 0 ? (
                    <div className={`p-10 rounded-2xl border text-center space-y-4 animate-in fade-in duration-200 ${
                      isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center mx-auto">
                        <ShieldAlert className="w-7 h-7" />
                      </div>
                      <div className="max-w-md mx-auto space-y-2">
                        <h4 className={`text-base font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                          No Guideline Compliance Check Performed
                        </h4>
                        <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                          No guideline compliance check was performed for this scan. Run an End-to-End Audit via the Audit Engine to generate a compliance verdict.
                        </p>
                      </div>
                      <div className="pt-2">
                        <button
                          onClick={() => {
                            setSelectedScan(null);
                            navigate('/audit');
                          }}
                          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all inline-flex items-center gap-2 cursor-pointer"
                        >
                          <Zap className="w-4 h-4 fill-current text-amber-300" />
                          <span>Run End-to-End Audit via Audit Engine</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6 animate-in fade-in duration-200">
                      {/* Overall Compliance Verdict & Pass Rate KPI Card */}
                      <div className={`p-6 rounded-2xl border transition-all ${
                        parsedPayload.overallCleared
                          ? isDark
                            ? 'bg-emerald-950/20 border-emerald-800/40'
                            : 'bg-emerald-50/70 border-emerald-200'
                          : isDark
                          ? 'bg-rose-950/20 border-rose-800/40'
                          : 'bg-rose-50/70 border-rose-200'
                      }`}>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                          <div className="space-y-2 min-w-0">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                Compliance Verification Verdict
                              </span>
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide border shadow-sm ${
                                parsedPayload.overallCleared
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-rose-600 text-white border-rose-600'
                              }`}>
                                {parsedPayload.overallCleared ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>CLEARED</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>UNCLEARED</span>
                                  </>
                                )}
                              </span>
                            </div>
                            <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                              {parsedPayload.overallCleared
                                ? 'All mandatory onboarding rules and regulatory conditions have been verified successfully.'
                                : `${parsedPayload.unclearedCount} of ${parsedPayload.totalRules} compliance conditions require attention or administrative follow-up.`}
                            </p>
                          </div>

                          {/* Stats Counters */}
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className={`px-4 py-2.5 rounded-xl border text-center ${
                              isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                            }`}>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pass Rate</div>
                              <div className={`text-lg font-extrabold ${
                                parsedPayload.passRate === 100
                                  ? 'text-emerald-500'
                                  : parsedPayload.passRate >= 60
                                  ? 'text-indigo-500'
                                  : 'text-rose-500'
                              }`}>
                                {parsedPayload.passRate}%
                              </div>
                            </div>

                            <div className={`px-4 py-2.5 rounded-xl border text-center ${
                              isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                            }`}>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Cleared</div>
                              <div className="text-lg font-extrabold text-emerald-500">{parsedPayload.clearedCount}</div>
                            </div>

                            <div className={`px-4 py-2.5 rounded-xl border text-center ${
                              isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                            }`}>
                              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-500">Uncleared</div>
                              <div className="text-lg font-extrabold text-rose-500">{parsedPayload.unclearedCount}</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Grouped Guideline Evaluations with AI Reasoning and Evidence */}
                      <div className="pt-2">
                        <GuidelineResults rules={parsedPayload.guidelineVerdicts} isDark={isDark} />
                      </div>
                    </div>
                  )
                ) : (
                  /* ============================================================ */
                  /* 3. DEVELOPER JSON VIEW                                       */
                  /* ============================================================ */
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {/* JSON sub-view switcher if guidelines exist */}
                    {guidelineJsonData && (
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className={`p-1 rounded-xl border inline-flex space-x-1 ${
                          isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                        }`}>
                          <button
                            onClick={() => setJsonSubTab('extracted')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              jsonSubTab === 'extracted'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Extracted OCR Blueprint
                          </button>
                          <button
                            onClick={() => setJsonSubTab('guideline')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              jsonSubTab === 'guideline'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Guideline Audit Results
                          </button>
                        </div>

                        <span className="text-xs text-slate-400 font-mono">
                          {jsonSubTab === 'guideline' ? 'Persisted Rule Evaluations JSON' : 'PostgreSQL JSONB Blueprint'}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-mono">
                        {activeJsonPayload ? `${JSON.stringify(activeJsonPayload).length.toLocaleString()} bytes` : '0 bytes'}
                      </span>
                      <button
                        onClick={() => copyModalJson(activeJsonPayload || selectedScan.extracted_json)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                          copiedJson
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : isDark
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                        }`}
                      >
                        {copiedJson ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Raw JSON</span>
                          </>
                        )}
                      </button>
                    </div>

                    <pre className={`text-xs font-mono p-4 rounded-2xl border overflow-auto max-h-[55vh] leading-relaxed whitespace-pre-wrap ${
                      isDark ? 'bg-slate-950/80 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}>
                      {JSON.stringify(activeJsonPayload || selectedScan.extracted_json, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

export default HomeDashboard;
