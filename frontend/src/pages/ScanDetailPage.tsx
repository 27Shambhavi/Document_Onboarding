import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../App';
import { api } from '../api/client';
import type { DocumentScan } from '../api/client';
import {
  FileText,
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Zap,
  FileSearch,
  Copy,
  Check,
  Code2,
  User,
  ExternalLink,
  Eye,
  EyeOff,
  IdCard,
  CreditCard,
} from 'lucide-react';
import { CandidateProfileCard } from '../components/audit/CandidateProfileCard';
import { GuidelineResults } from '../components/audit/GuidelineResults';

// ─── Payload parser (mirrors HomeDashboard.parseScanPayload) ──────────────────
const parseScanPayload = (
  rawJson: any,
  scanFilename?: string,
  scanId?: number,
  scanObj?: DocumentScan | null
) => {
  const formattedFallbackName = scanFilename
    ?.replace(/\.[^/.]+$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Candidate Record';

  if (!rawJson || typeof rawJson !== 'object') {
    return {
      candidateName: formattedFallbackName,
      requestId: `REQ-${scanId ?? '00'}`,
      hrProfile: {
        candidateName: formattedFallbackName,
        aadhaarNumber: '', aadhaarName: '', aadhaarDob: '', address: '',
        fatherName: '', panNumber: '', panName: '', panDob: '',
        email: '', mobile: '', gender: '', education: '',
        bankAccount: '', ifscCode: '', bankName: '',
      },
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

  const filesList = rawJson.files || rawJson.candidates_ocr_data?.[0]?.files || rawJson.documents || [];

  const hrProfile = {
    candidateName: '', aadhaarNumber: '', aadhaarName: '', aadhaarDob: '',
    address: '', fatherName: '', panNumber: '', panName: '', panDob: '',
    email: '', mobile: '', gender: '', education: '',
    bankAccount: '', ifscCode: '', bankName: '',
  };

  if (Array.isArray(filesList)) {
    filesList.forEach((f: any) => {
      const ocr = f?.ocr_data;
      if (ocr && typeof ocr === 'object') {
        if (!hrProfile.aadhaarNumber && (ocr.aadhar_number || ocr['AADHAR no'] || ocr.aadhar_no))
          hrProfile.aadhaarNumber = String(ocr.aadhar_number || ocr['AADHAR no'] || ocr.aadhar_no);
        if (!hrProfile.aadhaarName && (ocr.aadhar_name || ocr['Name as per Aadhar']))
          hrProfile.aadhaarName = String(ocr.aadhar_name || ocr['Name as per Aadhar']);
        if (!hrProfile.aadhaarDob && (ocr.aadhar_dob || ocr['DOB'] || ocr['Date of Birth']))
          hrProfile.aadhaarDob = String(ocr.aadhar_dob || ocr['DOB'] || ocr['Date of Birth']);
        if (!hrProfile.address && (ocr.aadhar_address || ocr['Current address'] || ocr['Permanent Address'] || ocr.Address))
          hrProfile.address = String(ocr.aadhar_address || ocr['Current address'] || ocr['Permanent Address'] || ocr.Address);
        if (!hrProfile.fatherName && (ocr.aadhar_father_name || ocr.pan_father_name || ocr["Father's Name"] || ocr['Father name']))
          hrProfile.fatherName = String(ocr.aadhar_father_name || ocr.pan_father_name || ocr["Father's Name"] || ocr['Father name']);
        if (!hrProfile.panNumber && (ocr.pan_number || ocr['PAN no'] || ocr.pan_no))
          hrProfile.panNumber = String(ocr.pan_number || ocr['PAN no'] || ocr.pan_no);
        if (!hrProfile.panName && (ocr.pan_name || ocr['Name as per PAN']))
          hrProfile.panName = String(ocr.pan_name || ocr['Name as per PAN']);
        if (!hrProfile.panDob && ocr.pan_dob)
          hrProfile.panDob = String(ocr.pan_dob);
        if (!hrProfile.email && (ocr.resume_email || ocr['Email id'] || ocr.email))
          hrProfile.email = String(ocr.resume_email || ocr['Email id'] || ocr.email);
        if (!hrProfile.mobile && (ocr.resume_mobile_no || ocr['Mobile no'] || ocr.mobile))
          hrProfile.mobile = String(ocr.resume_mobile_no || ocr['Mobile no'] || ocr.mobile);
        if (!hrProfile.gender && (ocr.Gender || ocr.gender || ocr.Sex))
          hrProfile.gender = String(ocr.Gender || ocr.gender || ocr.Sex);
        if (!hrProfile.education && (ocr.twelfth_name || ocr['Board Name'] || ocr['School Name']))
          hrProfile.education = [ocr['School Name'], ocr['Board Name'], ocr.twelfth_yop ? `(${ocr.twelfth_yop})` : ''].filter(Boolean).join(' - ');
        if (!hrProfile.bankAccount && (ocr.bank_account_number || ocr['Bank Account Number'] || ocr['Bank AC no'] || ocr.account_number))
          hrProfile.bankAccount = String(ocr.bank_account_number || ocr['Bank Account Number'] || ocr['Bank AC no'] || ocr.account_number);
        if (!hrProfile.ifscCode && (ocr.bank_ifsc_code || ocr['IFSC code'] || ocr.ifsc_code))
          hrProfile.ifscCode = String(ocr.bank_ifsc_code || ocr['IFSC code'] || ocr.ifsc_code);
        if (!hrProfile.bankName && (ocr.bank_name || ocr['Bank Name']))
          hrProfile.bankName = String(ocr.bank_name || ocr['Bank Name']);
      }
    });
  }

  if (rawJson.extracted_fields && typeof rawJson.extracted_fields === 'object') {
    const ef = rawJson.extracted_fields;
    if (!hrProfile.aadhaarNumber && (ef.aadhaar_number || ef.aadhar_number)) hrProfile.aadhaarNumber = String(ef.aadhaar_number || ef.aadhar_number);
    if (!hrProfile.panNumber && ef.pan_number) hrProfile.panNumber = String(ef.pan_number);
    if (!hrProfile.aadhaarDob && (ef.dob || ef.date_of_birth)) hrProfile.aadhaarDob = String(ef.dob || ef.date_of_birth);
    if (!hrProfile.address && ef.address) hrProfile.address = String(ef.address);
  }

  const name =
    rawJson.candidate_name || rawJson.full_name || hrProfile.aadhaarName || hrProfile.panName ||
    rawJson.extracted_fields?.full_name || rawJson.extracted_fields?.candidate_name ||
    rawJson.extracted_fields?.name || rawJson.extracted_fields?.['Candidate Name'] ||
    rawJson.candidates_ocr_data?.[0]?.candidate_name ||
    rawJson.candidates_ocr_data?.[0]?.extracted_fields?.['Candidate Name'] ||
    rawJson.candidates_ocr_data?.[0]?.extracted_fields?.name || formattedFallbackName;

  hrProfile.candidateName = name;

  const reqId = rawJson.requestId || rawJson.candidates_ocr_data?.[0]?.requestId || `REQ-${scanId ?? '00'}`;

  const detectedDocs: Array<{ id: string; label: string; fieldCount: number }> = [];
  if (Array.isArray(filesList)) {
    filesList.forEach((f: any, idx: number) => {
      if (f && typeof f === 'object') {
        const ocrCount = f.ocr_data && typeof f.ocr_data === 'object' ? Object.keys(f.ocr_data).length : 0;
        detectedDocs.push({ id: f.id || `DOC-${idx + 1}`, label: f.label || 'Document', fieldCount: ocrCount });
      }
    });
  }

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
  Object.entries(rawJson).forEach(([k, v]) => {
    if (typeof v !== 'object' &&
      !['raw_ocr_text','ocr_text','files','candidate_file','requestId','customer_id',
        'total_documents_detected','guideline','rule_results','failures','candidates_ocr_data',
        'verified_candidates','confidence_score','status','company_id','total_candidates',
        'total_candidates_processed','total_guidelines_evaluated','rules_by_document','grouped_guidelines',
      ].includes(k)) {
      if (!mergedFields[k]) mergedFields[k] = v;
    }
  });

  const fields = Object.entries(mergedFields).filter(
    ([k, v]) => typeof v !== 'object' &&
      !['raw_ocr_text','ocr_text','candidate_file','requestId','customer_id','total_documents_detected'].includes(k)
  );

  const guidelineVerdicts: any[] = [];
  const pushRule = (r: any, fallbackDocLabel?: string, idxKey?: string | number) => {
    if (!r || typeof r !== 'object') return;
    const docLabel = r.document_label || fallbackDocLabel;
    const title = r.field_name || r.rule_title || r.title || 'Guideline Requirement';
    const isCleared = r.status === 'CLEARED' || r.matched === true;
    guidelineVerdicts.push({
      id: r.rule_id || r.id || `rule-${idxKey ?? guidelineVerdicts.length}`,
      title, rule_title: title, document_label: docLabel,
      evidence: r.evidence || (isCleared ? 'Requirement verified successfully.' : 'Missing or invalid requirement.'),
      reasoning: r.reasoning || r.explanation || (isCleared ? `Condition satisfied for ${title}.` : `Verification failed for ${title}.`),
      recommendation: r.recommendation,
      status: r.status || (isCleared ? 'CLEARED' : 'UNCLEARED'),
      matched: isCleared, passed: isCleared,
    });
  };

  const rulesByDoc = scanObj?.rules_by_document || rawJson.rules_by_document || rawJson.verified_candidates?.[0]?.rules_by_document;
  if (rulesByDoc && typeof rulesByDoc === 'object' && !Array.isArray(rulesByDoc)) {
    Object.entries(rulesByDoc).forEach(([docLabel, rules]) => {
      if (Array.isArray(rules)) rules.forEach((r, idx) => pushRule(r, docLabel, `${docLabel}-${idx}`));
    });
  }

  const groupedGuidelines = scanObj?.grouped_guidelines || rawJson.grouped_guidelines || rawJson.verified_candidates?.[0]?.grouped_guidelines;
  if (guidelineVerdicts.length === 0 && groupedGuidelines && typeof groupedGuidelines === 'object' && !Array.isArray(groupedGuidelines)) {
    Object.entries(groupedGuidelines).forEach(([docLabel, groupVal]: [string, any]) => {
      if (groupVal && Array.isArray(groupVal.rules)) groupVal.rules.forEach((r: any, idx: number) => pushRule(r, docLabel, `${docLabel}-${idx}`));
    });
  }

  if (guidelineVerdicts.length === 0) {
    const rawGuidelines =
      scanObj?.guideline || rawJson.guideline || rawJson.verified_candidates?.[0]?.guideline ||
      rawJson.results?.[0]?.guideline || rawJson.rule_results || [];
    if (Array.isArray(rawGuidelines)) {
      rawGuidelines.forEach((item: any, gIdx: number) => {
        if (item && typeof item === 'object') {
          if (Array.isArray(item.rules) && item.rules.length > 0) {
            item.rules.forEach((r: any, rIdx: number) => pushRule(r, item.document_label, `${gIdx}-${rIdx}`));
          } else if (item.rule_id || item.rule_title || item.status) {
            pushRule(item, item.document_label, gIdx);
          } else {
            if (Array.isArray(item.cleared_guidelines)) {
              item.cleared_guidelines.forEach((ruleItem: any, idx: number) => {
                const str = typeof ruleItem === 'string' ? ruleItem : (ruleItem?.reasoning || ruleItem?.field || JSON.stringify(ruleItem));
                const parts = str.split('->');
                const docContext = item.document_label || (parts.length > 1 ? parts[0]?.trim() : undefined);
                const fieldName = parts.length > 1 ? parts[1]?.trim() : parts[0]?.trim() || str;
                guidelineVerdicts.push({
                  id: `pass-${gIdx}-${idx}`, title: fieldName, rule_title: fieldName,
                  document_label: docContext,
                  evidence: parts.length > 2 ? parts.slice(2).join('->').trim() : (parts.length > 1 ? parts[1].trim() : 'Requirement verified successfully.'),
                  reasoning: parts.length > 2 ? parts.slice(2).join('->').trim() : str,
                  status: 'CLEARED', matched: true, passed: true,
                });
              });
            }
            if (Array.isArray(item.uncleared_guidelines)) {
              item.uncleared_guidelines.forEach((ruleItem: any, idx: number) => {
                const str = typeof ruleItem === 'string' ? ruleItem : (ruleItem?.reasoning || ruleItem?.field || JSON.stringify(ruleItem));
                const parts = str.split('->');
                const docContext = item.document_label || (parts.length > 1 ? parts[0]?.trim() : undefined);
                const fieldName = parts.length > 1 ? parts[1]?.trim() : parts[0]?.trim() || str;
                guidelineVerdicts.push({
                  id: `fail-${gIdx}-${idx}`, title: fieldName, rule_title: fieldName,
                  document_label: docContext,
                  evidence: parts.length > 2 ? parts.slice(2).join('->').trim() : 'Missing or invalid requirement.',
                  reasoning: parts.length > 2 ? parts.slice(2).join('->').trim() : str,
                  status: 'UNCLEARED', matched: false, passed: false,
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

  return { candidateName: name, requestId: reqId, hrProfile, detectedDocs, fields, mergedFields, guidelineVerdicts, totalRules, clearedCount, unclearedCount, passRate, overallCleared };
};

// ─── Main ScanDetailPage ──────────────────────────────────────────────────────
export const ScanDetailPage: React.FC = () => {
  const { scanId } = useParams<{ scanId: string }>();
  const navigate = useNavigate();
  const { isDark } = useTheme();

  const [scan, setScan] = useState<DocumentScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'profile' | 'guideline' | 'json'>('profile');
  const [jsonSubTab, setJsonSubTab] = useState<'extracted' | 'guideline'>('extracted');
  const [copiedJson, setCopiedJson] = useState(false);

  const [docBlobUrl, setDocBlobUrl] = useState<string | null>(null);
  const [loadingDocBlob, setLoadingDocBlob] = useState(false);
  const [docBlobError, setDocBlobError] = useState<string | null>(null);
  const [showDocPreview, setShowDocPreview] = useState(true);

  const directDocUrl = scanId ? api.getScanDocumentUrl(Number(scanId)) : null;
  const effectivePdfUrl = docBlobUrl || directDocUrl;

  // ── Fetch scan data ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scanId) { setLoadingError('Invalid scan ID'); setLoading(false); return; }
    let mounted = true;
    let activeBlobUrl: string | null = null;

    const fetchScan = async () => {
      setLoading(true);
      try {
        const detail = await api.getScanDetail(Number(scanId));
        if (mounted) setScan(detail);
      } catch (err: any) {
        if (mounted) setLoadingError(err?.response?.data?.detail || 'Failed to load scan record.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    const fetchBlob = async () => {
      setLoadingDocBlob(true);
      setDocBlobError(null);
      try {
        const blob = await api.getScanFileBlob(Number(scanId));
        if (mounted) {
          const url = URL.createObjectURL(blob);
          activeBlobUrl = url;
          setDocBlobUrl(url);
          setDocBlobError(null);
        }
      } catch (err: any) {
        if (mounted) {
          setDocBlobError(err?.response?.data?.detail || 'Original document PDF file was not found on server disk.');
        }
      } finally {
        if (mounted) setLoadingDocBlob(false);
      }
    };

    fetchScan();
    fetchBlob();

    return () => {
      mounted = false;
      if (activeBlobUrl) URL.revokeObjectURL(activeBlobUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  const copyJson = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  // ── Loading / Error states ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center h-[70vh] gap-4 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
        <div className="w-10 h-10 border-2 border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin" />
        <span className="text-sm font-semibold text-slate-400">Loading scan record from database...</span>
      </div>
    );
  }

  if (loadingError || !scan) {
    return (
      <div className={`flex flex-col items-center justify-center h-[70vh] gap-5 text-center`}>
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${isDark ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-500'}`}>
          <ShieldAlert className="w-7 h-7" />
        </div>
        <div>
          <h3 className="text-base font-bold">Scan Record Not Found</h3>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{loadingError || 'This scan does not exist or you do not have access.'}</p>
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </button>
      </div>
    );
  }

  const parsed = parseScanPayload(scan.extracted_json, scan.filename, scan.id, scan);

  const guidelineJsonData =
    scan.rules_by_document && Object.keys(scan.rules_by_document).length > 0 ? scan.rules_by_document
    : scan.guideline && scan.guideline.length > 0 ? scan.guideline
    : scan.grouped_guidelines && Object.keys(scan.grouped_guidelines).length > 0 ? scan.grouped_guidelines
    : parsed.guidelineVerdicts.length > 0 ? parsed.guidelineVerdicts
    : null;

  const activeJsonPayload =
    jsonSubTab === 'guideline' && guidelineJsonData ? guidelineJsonData : scan.extracted_json;

  // ── Full Page Layout ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full -m-6">

      {/* ── TOP NAVIGATION BAR ─────────────────────────────────────────────── */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between px-6 py-3.5 border-b gap-4 flex-shrink-0 ${
        isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex items-center gap-4 min-w-0">
          {/* Back button */}
          <button
            onClick={() => navigate('/dashboard')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
            title="Return to dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Dashboard</span>
          </button>

          <div className="h-6 w-px bg-slate-300 dark:bg-slate-700 hidden sm:block" />

          {/* Scan title + meta */}
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className={`text-base md:text-lg font-black truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {parsed.candidateName}
              </h1>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold ${
                isDark ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              }`}>
                #{scan.id}
              </span>
              <span className="text-xs text-slate-400 font-mono">{parsed.requestId}</span>
            </div>
            <p className="text-xs text-slate-400 truncate mt-0.5">
              {scan.filename} · {scan.pages_count} {scan.pages_count === 1 ? 'page' : 'pages'} · ₹{scan.cost_inr.toFixed(2)}
              {scan.created_at && ` · ${new Date(scan.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
            </p>
          </div>
        </div>

        {/* 3-Way Toggle */}
        <div className="flex items-center gap-3 self-end md:self-auto flex-shrink-0">
          <div className={`p-1 rounded-xl border flex space-x-1 ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
            <button
              onClick={() => setViewMode('profile')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'profile' ? 'bg-indigo-600 text-white shadow-sm' : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Profile View</span>
            </button>
            <button
              onClick={() => setViewMode('guideline')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'guideline' ? 'bg-indigo-600 text-white shadow-sm' : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Guideline Audit</span>
              {parsed.totalRules > 0 && (
                <span className={`text-[10px] px-1.5 rounded-full font-extrabold ${
                  viewMode === 'guideline' ? 'bg-white/20 text-white'
                  : parsed.overallCleared ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                }`}>
                  {parsed.totalRules}
                </span>
              )}
            </button>
            <button
              onClick={() => setViewMode('json')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'json' ? 'bg-indigo-600 text-white shadow-sm' : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Developer JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── PAGE BODY ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">

        {/* ── VIEW 1: PROFILE ─────────────────────────────────────────────── */}
        {viewMode === 'profile' && (
          <div className="h-full flex flex-col lg:flex-row overflow-hidden">
            {/* Left pane: profile cards */}
            <div className={`h-full overflow-y-auto p-6 space-y-6 transition-all ${
              showDocPreview ? 'w-full lg:w-7/12 xl:w-3/5 border-r border-slate-200 dark:border-slate-800' : 'w-full'
            }`}>
              {/* Hero header */}
              <div className={`p-6 rounded-3xl border transition-all ${
                isDark ? 'bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border-slate-800'
                : 'bg-gradient-to-r from-indigo-50/70 via-white to-blue-50/60 border-indigo-100 shadow-sm'
              }`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-xl shadow-lg shadow-indigo-500/20 flex-shrink-0">
                      {parsed.candidateName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
                        Candidate Profile Summary
                      </span>
                      <h2 className={`text-xl sm:text-2xl font-black truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {parsed.candidateName}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>Request ID: <strong className="font-mono text-indigo-500 dark:text-indigo-400">{parsed.requestId}</strong></span>
                        <span>·</span>
                        <span>Source: <strong>{scan.filename}</strong></span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDocPreview(!showDocPreview)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer flex-shrink-0 ${
                      showDocPreview
                        ? isDark ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30' : 'bg-indigo-100 text-indigo-700 border-indigo-200'
                        : isDark ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700' : 'bg-white text-slate-700 border-slate-200 shadow-sm hover:bg-slate-50'
                    }`}
                  >
                    {showDocPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showDocPreview ? 'Collapse PDF' : 'View Original PDF'}</span>
                  </button>
                </div>
              </div>

              {/* Primary Identity card */}
              <div className={`p-6 rounded-3xl border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <IdCard className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                      Primary Identity &amp; KYC Verification
                    </h4>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Identity Verified
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { label: 'Candidate Full Name', value: parsed.candidateName, mono: false },
                    { label: 'Aadhaar Number', value: parsed.hrProfile.aadhaarNumber || '—', mono: true },
                    { label: 'Date of Birth (DOB)', value: parsed.hrProfile.aadhaarDob || parsed.hrProfile.panDob || '—', mono: false },
                    { label: 'PAN Number', value: parsed.hrProfile.panNumber || '—', mono: true },
                    { label: "Father's / Guardian Name", value: parsed.hrProfile.fatherName || '—', mono: false },
                    { label: 'Gender', value: parsed.hrProfile.gender || '—', mono: false },
                  ].map(({ label, value, mono }) => (
                    <div key={label} className={`p-3.5 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'}`}>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">{label}</span>
                      <p className={`text-sm font-bold truncate ${
                        mono ? (value !== '—' ? 'text-indigo-500 dark:text-indigo-400 font-mono' : 'text-slate-400')
                        : (value !== '—' ? (isDark ? 'text-white' : 'text-slate-900') : 'text-slate-400')
                      }`}>{value}</p>
                    </div>
                  ))}
                  {/* Address full width */}
                  <div className={`p-3.5 rounded-2xl border sm:col-span-2 lg:col-span-3 ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'}`}>
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Address (as per KYC documents)</span>
                    <p className={`text-sm font-medium leading-relaxed ${
                      parsed.hrProfile.address ? (isDark ? 'text-slate-200' : 'text-slate-800') : 'text-slate-400'
                    }`}>{parsed.hrProfile.address || '—'}</p>
                  </div>
                </div>
              </div>

              {/* Contact & Banking card */}
              {(parsed.hrProfile.mobile || parsed.hrProfile.email || parsed.hrProfile.bankAccount || parsed.hrProfile.ifscCode) && (
                <div className={`p-6 rounded-3xl border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                  <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-200 dark:border-slate-800">
                    <CreditCard className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400">Contact &amp; Banking Details</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {parsed.hrProfile.mobile && (
                      <div className={`p-3.5 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'}`}>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Mobile</span>
                        <p className="text-sm font-bold truncate">{parsed.hrProfile.mobile}</p>
                      </div>
                    )}
                    {parsed.hrProfile.email && (
                      <div className={`p-3.5 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'}`}>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Email</span>
                        <p className="text-sm font-bold truncate">{parsed.hrProfile.email}</p>
                      </div>
                    )}
                    {parsed.hrProfile.bankName && (
                      <div className={`p-3.5 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'}`}>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Bank Name</span>
                        <p className="text-sm font-bold truncate">{parsed.hrProfile.bankName}</p>
                      </div>
                    )}
                    {parsed.hrProfile.bankAccount && (
                      <div className={`p-3.5 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'}`}>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Account Number</span>
                        <p className="text-sm font-bold font-mono truncate">{parsed.hrProfile.bankAccount}</p>
                      </div>
                    )}
                    {parsed.hrProfile.ifscCode && (
                      <div className={`p-3.5 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'}`}>
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">IFSC Code</span>
                        <p className="text-sm font-bold font-mono truncate">{parsed.hrProfile.ifscCode}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Guideline compliance banner */}
              {parsed.totalRules > 0 && (
                <div className={`p-5 rounded-3xl border flex items-center justify-between gap-4 ${
                  parsed.overallCleared
                    ? isDark ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-emerald-50/70 border-emerald-200'
                    : isDark ? 'bg-rose-950/20 border-rose-800/40' : 'bg-rose-50/70 border-rose-200'
                }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                      parsed.overallCleared
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                    }`}>
                      {parsed.overallCleared ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <h5 className="text-sm font-bold flex items-center gap-2 flex-wrap">
                        <span>Compliance Audit Status:</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${parsed.overallCleared ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
                          {parsed.overallCleared ? 'CLEARED' : 'UNCLEARED'} ({parsed.passRate}% Pass Rate)
                        </span>
                      </h5>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {parsed.clearedCount} of {parsed.totalRules} verified compliance conditions satisfied.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setViewMode('guideline')}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
                  >
                    <span>Open Guideline Audit</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Extracted document breakdown */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                  <span>Extracted Documents &amp; Certificate Data</span>
                </h4>
                <CandidateProfileCard
                  extractedData={parsed.mergedFields}
                  candidateName={parsed.candidateName}
                  isDark={isDark}
                />
              </div>
            </div>

            {/* Right pane: PDF preview */}
            {showDocPreview && (
              <div className="w-full lg:w-5/12 xl:w-2/5 h-full flex flex-col bg-slate-100 dark:bg-slate-900 border-t lg:border-t-0 flex-shrink-0">
                <div className={`flex items-center justify-between px-5 py-3 border-b flex-shrink-0 ${
                  isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                }`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <span className="text-xs font-bold truncate">{scan.filename}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                      {scan.pages_count} {scan.pages_count === 1 ? 'page' : 'pages'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {effectivePdfUrl && !docBlobError && (
                      <a
                        href={effectivePdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                          isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700'
                        }`}
                        title="Open original document in new tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">New Tab</span>
                      </a>
                    )}
                    <button
                      onClick={() => setShowDocPreview(false)}
                      className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
                      }`}
                      title="Collapse document preview"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Hide</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 w-full h-full relative overflow-hidden bg-slate-200/60 dark:bg-slate-950">
                  {loadingDocBlob ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-indigo-400">
                      <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                      <span className="text-xs font-semibold text-slate-400">Loading original PDF preview...</span>
                    </div>
                  ) : effectivePdfUrl && !docBlobError ? (
                    <iframe
                      src={effectivePdfUrl}
                      title={`Original Document Preview - ${scan.filename}`}
                      className="w-full h-full border-0"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-400 space-y-2">
                      <FileSearch className="w-10 h-10 opacity-30 text-indigo-400" />
                      <p className="text-xs font-bold text-slate-400">{docBlobError || 'Original PDF document not available on disk.'}</p>
                      <p className="text-[11px] text-slate-500 max-w-xs">Cross-reference the verified data fields extracted into the profile panel.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── VIEW 2: GUIDELINE AUDIT ─────────────────────────────────────── */}
        {viewMode === 'guideline' && (
          <div className="h-full overflow-y-auto p-6 space-y-6">
            {parsed.totalRules === 0 ? (
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
                <button
                  onClick={() => navigate('/audit')}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all inline-flex items-center gap-2 cursor-pointer"
                >
                  <Zap className="w-4 h-4 fill-current text-amber-300" />
                  <span>Run End-to-End Audit via Audit Engine</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-200">
                {/* Overall verdict KPI */}
                <div className={`p-6 rounded-2xl border transition-all ${
                  parsed.overallCleared
                    ? isDark ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-emerald-50/70 border-emerald-200'
                    : isDark ? 'bg-rose-950/20 border-rose-800/40' : 'bg-rose-50/70 border-rose-200'
                }`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Compliance Verification Verdict</span>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide border shadow-sm ${
                          parsed.overallCleared ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-rose-600 text-white border-rose-600'
                        }`}>
                          {parsed.overallCleared ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                          <span>{parsed.overallCleared ? 'CLEARED' : 'UNCLEARED'}</span>
                        </span>
                      </div>
                      <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        {parsed.overallCleared
                          ? 'All mandatory onboarding rules and regulatory conditions have been verified successfully.'
                          : `${parsed.unclearedCount} of ${parsed.totalRules} compliance conditions require attention or administrative follow-up.`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {[
                        { label: 'Pass Rate', value: `${parsed.passRate}%`, color: parsed.passRate === 100 ? 'text-emerald-500' : parsed.passRate >= 60 ? 'text-indigo-500' : 'text-rose-500' },
                        { label: 'Cleared', value: parsed.clearedCount, color: 'text-emerald-500' },
                        { label: 'Uncleared', value: parsed.unclearedCount, color: 'text-rose-500' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className={`px-4 py-2.5 rounded-xl border text-center ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
                          <div className={`text-[10px] font-bold uppercase tracking-wider ${color}`}>{label}</div>
                          <div className={`text-lg font-extrabold ${color}`}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <GuidelineResults rules={parsed.guidelineVerdicts} isDark={isDark} />
              </div>
            )}
          </div>
        )}

        {/* ── VIEW 3: DEVELOPER JSON ──────────────────────────────────────── */}
        {viewMode === 'json' && (
          <div className="h-full overflow-y-auto p-6 space-y-4">
            {guidelineJsonData && (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className={`p-1 rounded-xl border inline-flex space-x-1 ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
                  {(['extracted', 'guideline'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setJsonSubTab(tab)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        jsonSubTab === tab ? 'bg-indigo-600 text-white shadow-sm' : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab === 'extracted' ? 'Extracted OCR Blueprint' : 'Guideline Audit Results'}
                    </button>
                  ))}
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
                onClick={() => copyJson(activeJsonPayload || scan.extracted_json)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  copiedJson
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                }`}
              >
                {copiedJson ? <><Check className="w-3.5 h-3.5 text-emerald-400" /><span>Copied!</span></> : <><Copy className="w-3.5 h-3.5" /><span>Copy Raw JSON</span></>}
              </button>
            </div>
            <pre className={`text-xs font-mono p-4 rounded-2xl border overflow-auto max-h-[75vh] leading-relaxed whitespace-pre-wrap ${
              isDark ? 'bg-slate-950/80 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}>
              {JSON.stringify(activeJsonPayload || scan.extracted_json, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScanDetailPage;
