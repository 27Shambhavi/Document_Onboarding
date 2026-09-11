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
  ArrowLeft,
  Sliders,
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
  X,
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

  // PDF Document preview state for cross-checking
  const [docBlobUrl, setDocBlobUrl] = useState<string | null>(null);
  const [loadingDocBlob, setLoadingDocBlob] = useState(false);
  const [docBlobError, setDocBlobError] = useState<string | null>(null);
  const [showDocPreview, setShowDocPreview] = useState(true);

  const closeScanDetail = () => {
    if (docBlobUrl) {
      URL.revokeObjectURL(docBlobUrl);
      setDocBlobUrl(null);
    }
    setSelectedScan(null);
  };

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
          aadhaarNumber: '',
          aadhaarName: '',
          aadhaarDob: '',
          address: '',
          fatherName: '',
          panNumber: '',
          panName: '',
          panDob: '',
          email: '',
          mobile: '',
          gender: '',
          education: '',
          bankAccount: '',
          ifscCode: '',
          bankName: '',
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

    // 1. Files list
    const filesList =
      rawJson.files ||
      rawJson.candidates_ocr_data?.[0]?.files ||
      rawJson.documents ||
      [];

    // 2. Synthesize structured HR profile fields
    const hrProfile = {
      candidateName: '',
      aadhaarNumber: '',
      aadhaarName: '',
      aadhaarDob: '',
      address: '',
      fatherName: '',
      panNumber: '',
      panName: '',
      panDob: '',
      email: '',
      mobile: '',
      gender: '',
      education: '',
      bankAccount: '',
      ifscCode: '',
      bankName: '',
    };

    if (Array.isArray(filesList)) {
      filesList.forEach((f: any) => {
        const ocr = f?.ocr_data;
        if (ocr && typeof ocr === 'object') {
          // Aadhaar data
          if (!hrProfile.aadhaarNumber && (ocr.aadhar_number || ocr['AADHAR no'] || ocr.aadhar_no)) {
            hrProfile.aadhaarNumber = String(ocr.aadhar_number || ocr['AADHAR no'] || ocr.aadhar_no);
          }
          if (!hrProfile.aadhaarName && (ocr.aadhar_name || ocr['Name as per Aadhar'])) {
            hrProfile.aadhaarName = String(ocr.aadhar_name || ocr['Name as per Aadhar']);
          }
          if (!hrProfile.aadhaarDob && (ocr.aadhar_dob || ocr['DOB'] || ocr['Date of Birth'])) {
            hrProfile.aadhaarDob = String(ocr.aadhar_dob || ocr['DOB'] || ocr['Date of Birth']);
          }
          if (!hrProfile.address && (ocr.aadhar_address || ocr['Current address'] || ocr['Permanent Address'] || ocr.Address)) {
            hrProfile.address = String(ocr.aadhar_address || ocr['Current address'] || ocr['Permanent Address'] || ocr.Address);
          }
          if (!hrProfile.fatherName && (ocr.aadhar_father_name || ocr.pan_father_name || ocr["Father's Name"] || ocr['Father name'])) {
            hrProfile.fatherName = String(ocr.aadhar_father_name || ocr.pan_father_name || ocr["Father's Name"] || ocr['Father name']);
          }

          // PAN data
          if (!hrProfile.panNumber && (ocr.pan_number || ocr['PAN no'] || ocr.pan_no)) {
            hrProfile.panNumber = String(ocr.pan_number || ocr['PAN no'] || ocr.pan_no);
          }
          if (!hrProfile.panName && (ocr.pan_name || ocr['Name as per PAN'])) {
            hrProfile.panName = String(ocr.pan_name || ocr['Name as per PAN']);
          }
          if (!hrProfile.panDob && ocr.pan_dob) {
            hrProfile.panDob = String(ocr.pan_dob);
          }

          // Contact details
          if (!hrProfile.email && (ocr.resume_email || ocr['Email id'] || ocr.email)) {
            hrProfile.email = String(ocr.resume_email || ocr['Email id'] || ocr.email);
          }
          if (!hrProfile.mobile && (ocr.resume_mobile_no || ocr['Mobile no'] || ocr.mobile)) {
            hrProfile.mobile = String(ocr.resume_mobile_no || ocr['Mobile no'] || ocr.mobile);
          }
          if (!hrProfile.gender && (ocr.Gender || ocr.gender || ocr.Sex)) {
            hrProfile.gender = String(ocr.Gender || ocr.gender || ocr.Sex);
          }

          // Education details
          if (!hrProfile.education && (ocr.twelfth_name || ocr['Board Name'] || ocr['School Name'])) {
            hrProfile.education = [ocr['School Name'], ocr['Board Name'], ocr.twelfth_yop ? `(${ocr.twelfth_yop})` : ''].filter(Boolean).join(' - ');
          }

          // Banking details
          if (!hrProfile.bankAccount && (ocr.bank_account_number || ocr['Bank Account Number'] || ocr['Bank AC no'] || ocr.account_number)) {
            hrProfile.bankAccount = String(ocr.bank_account_number || ocr['Bank Account Number'] || ocr['Bank AC no'] || ocr.account_number);
          }
          if (!hrProfile.ifscCode && (ocr.bank_ifsc_code || ocr['IFSC code'] || ocr.ifsc_code)) {
            hrProfile.ifscCode = String(ocr.bank_ifsc_code || ocr['IFSC code'] || ocr.ifsc_code);
          }
          if (!hrProfile.bankName && (ocr.bank_name || ocr['Bank Name'])) {
            hrProfile.bankName = String(ocr.bank_name || ocr['Bank Name']);
          }
        }
      });
    }

    // Direct extracted_fields fallback
    if (rawJson.extracted_fields && typeof rawJson.extracted_fields === 'object') {
      const ef = rawJson.extracted_fields;
      if (!hrProfile.aadhaarNumber && (ef.aadhaar_number || ef.aadhar_number)) hrProfile.aadhaarNumber = String(ef.aadhaar_number || ef.aadhar_number);
      if (!hrProfile.panNumber && ef.pan_number) hrProfile.panNumber = String(ef.pan_number);
      if (!hrProfile.aadhaarDob && (ef.dob || ef.date_of_birth)) hrProfile.aadhaarDob = String(ef.dob || ef.date_of_birth);
      if (!hrProfile.address && ef.address) hrProfile.address = String(ef.address);
    }

    // 3. Resolve prominent candidate name
    let name =
      rawJson.candidate_name ||
      rawJson.full_name ||
      hrProfile.aadhaarName ||
      hrProfile.panName ||
      rawJson.extracted_fields?.full_name ||
      rawJson.extracted_fields?.candidate_name ||
      rawJson.extracted_fields?.name ||
      rawJson.extracted_fields?.['Candidate Name'] ||
      rawJson.candidates_ocr_data?.[0]?.candidate_name ||
      rawJson.candidates_ocr_data?.[0]?.extracted_fields?.['Candidate Name'] ||
      rawJson.candidates_ocr_data?.[0]?.extracted_fields?.name ||
      formattedFallbackName;

    hrProfile.candidateName = name;

    // 4. Request / Customer ID
    const reqId =
      rawJson.requestId ||
      rawJson.candidates_ocr_data?.[0]?.requestId ||
      `REQ-${scanId ?? '00'}`;

    // 5. Detected Documents
    const detectedDocs: Array<{ id: string; label: string; fieldCount: number }> = [];
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
      hrProfile,
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
    setSelectedScan(scan); // show view immediately with skeleton
    setShowDocPreview(true);
    setDocBlobError(null);

    // Revoke previous blob url if any
    if (docBlobUrl) {
      URL.revokeObjectURL(docBlobUrl);
      setDocBlobUrl(null);
    }

    try {
      const detail = await api.getScanDetail(scan.id);
      setSelectedScan(detail);
    } catch (err) {
      console.error('Failed to fetch scan detail:', err);
    } finally {
      setLoadingDetail(false);
    }

    // Stream original document for inline PDF preview
    setLoadingDocBlob(true);
    try {
      const blob = await api.getScanFileBlob(scan.id);
      const url = URL.createObjectURL(blob);
      setDocBlobUrl(url);
    } catch (err) {
      console.error('Failed to load document preview blob:', err);
      setDocBlobError('Original document PDF file was not found on server disk.');
    } finally {
      setLoadingDocBlob(false);
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
          <div className={`fixed inset-0 z-50 flex flex-col w-screen h-screen overflow-hidden animate-in fade-in duration-200 ${
            isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
          }`}>
            {/* Top Fullscreen Header Navigation Bar */}
            <div className={`flex flex-col md:flex-row md:items-center justify-between px-6 py-3.5 border-b gap-4 flex-shrink-0 z-20 ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center gap-4 min-w-0">
                <button
                  onClick={closeScanDetail}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                  title="Return to dashboard"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Dashboard</span>
                </button>

                <div className="h-6 w-px bg-slate-300 dark:bg-slate-700 hidden sm:block" />

                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className={`text-base md:text-lg font-black truncate ${
                      isDark ? 'text-white' : 'text-slate-900'
                    }`}>
                      {parsedPayload.candidateName}
                    </h2>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold ${
                      isDark ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    }`}>
                      #{selectedScan.id}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {parsedPayload.requestId}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {selectedScan.filename} · {selectedScan.pages_count} {selectedScan.pages_count === 1 ? 'page' : 'pages'} · ₹{selectedScan.cost_inr.toFixed(2)}
                    {selectedScan.created_at && ` · ${new Date(selectedScan.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                </div>
              </div>

              {/* 3-Way Toggle Switcher & Close button */}
              <div className="flex items-center gap-3 self-end md:self-auto flex-shrink-0">
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
                    <User className="w-3.5 h-3.5" />
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
                  onClick={closeScanDetail}
                  className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                    isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                  title="Close fullscreen view"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Fullscreen Body Content */}
            <div className="flex-1 overflow-hidden">
              {loadingDetail ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-indigo-400">
                  <div className="w-8 h-8 border-2 border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin" />
                  <span className="text-sm font-medium">Loading scan payload from PostgreSQL...</span>
                </div>
              ) : modalViewMode === 'profile' ? (
                /* ============================================================ */
                /* 1. OCR PROFILE VIEW (HR-Friendly + Side-by-Side PDF Preview) */
                /* ============================================================ */
                <div className="h-full flex flex-col lg:flex-row overflow-hidden">
                  {/* Left Pane: HR Candidate Profile Summary (Scrollable) */}
                  <div className={`h-full overflow-y-auto p-6 space-y-6 transition-all ${
                    showDocPreview ? 'w-full lg:w-7/12 xl:w-3/5 border-r border-slate-200 dark:border-slate-800' : 'w-full'
                  }`}>
                    {/* Candidate Hero Header Card */}
                    <div className={`p-6 rounded-3xl border transition-all ${
                      isDark
                        ? 'bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border-slate-800'
                        : 'bg-gradient-to-r from-indigo-50/70 via-white to-blue-50/60 border-indigo-100 shadow-sm'
                    }`}>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-xl shadow-lg shadow-indigo-500/20 flex-shrink-0">
                            {parsedPayload.candidateName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
                              Candidate Profile Summary
                            </span>
                            <h3 className={`text-xl sm:text-2xl font-black truncate ${
                              isDark ? 'text-white' : 'text-slate-900'
                            }`}>
                              {parsedPayload.candidateName}
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>Request ID: <strong className="font-mono text-indigo-500 dark:text-indigo-400">{parsedPayload.requestId}</strong></span>
                              <span>·</span>
                              <span>Source: <strong>{selectedScan.filename}</strong></span>
                            </p>
                          </div>
                        </div>

                        {/* Actions: Toggle PDF Preview button */}
                        <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                          <button
                            onClick={() => setShowDocPreview(!showDocPreview)}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
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
                    </div>

                    {/* Primary Identity & KYC Card */}
                    <div className={`p-6 rounded-3xl border ${
                      isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                    }`}>
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
                        {/* Candidate Full Name */}
                        <div className={`p-3.5 rounded-2xl border ${
                          isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'
                        }`}>
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                            Candidate Full Name
                          </span>
                          <p className={`text-sm font-bold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            {parsedPayload.candidateName}
                          </p>
                        </div>

                        {/* Aadhaar Number */}
                        <div className={`p-3.5 rounded-2xl border ${
                          isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'
                        }`}>
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                            Aadhaar Number
                          </span>
                          <p className={`text-sm font-bold font-mono ${
                            parsedPayload.hrProfile.aadhaarNumber ? 'text-indigo-500 dark:text-indigo-400' : isDark ? 'text-slate-500' : 'text-slate-400'
                          }`}>
                            {parsedPayload.hrProfile.aadhaarNumber || '—'}
                          </p>
                        </div>

                        {/* Date of Birth */}
                        <div className={`p-3.5 rounded-2xl border ${
                          isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'
                        }`}>
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                            Date of Birth (DOB)
                          </span>
                          <p className={`text-sm font-bold ${
                            parsedPayload.hrProfile.aadhaarDob || parsedPayload.hrProfile.panDob ? isDark ? 'text-slate-100' : 'text-slate-900' : 'text-slate-400'
                          }`}>
                            {parsedPayload.hrProfile.aadhaarDob || parsedPayload.hrProfile.panDob || '—'}
                          </p>
                        </div>

                        {/* PAN Number */}
                        <div className={`p-3.5 rounded-2xl border ${
                          isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'
                        }`}>
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                            PAN Number
                          </span>
                          <p className={`text-sm font-bold font-mono ${
                            parsedPayload.hrProfile.panNumber ? 'text-indigo-500 dark:text-indigo-400' : isDark ? 'text-slate-500' : 'text-slate-400'
                          }`}>
                            {parsedPayload.hrProfile.panNumber || '—'}
                          </p>
                        </div>

                        {/* Father's / Guardian Name */}
                        <div className={`p-3.5 rounded-2xl border ${
                          isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'
                        }`}>
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                            Father's / Guardian Name
                          </span>
                          <p className={`text-sm font-bold ${
                            parsedPayload.hrProfile.fatherName ? isDark ? 'text-slate-100' : 'text-slate-900' : 'text-slate-400'
                          }`}>
                            {parsedPayload.hrProfile.fatherName || '—'}
                          </p>
                        </div>

                        {/* Gender */}
                        <div className={`p-3.5 rounded-2xl border ${
                          isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'
                        }`}>
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                            Gender
                          </span>
                          <p className={`text-sm font-bold ${
                            parsedPayload.hrProfile.gender ? isDark ? 'text-slate-100' : 'text-slate-900' : 'text-slate-400'
                          }`}>
                            {parsedPayload.hrProfile.gender || '—'}
                          </p>
                        </div>

                        {/* Address */}
                        <div className={`p-3.5 rounded-2xl border sm:col-span-2 lg:col-span-3 ${
                          isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'
                        }`}>
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                            Address (as per KYC documents)
                          </span>
                          <p className={`text-sm font-medium leading-relaxed ${
                            parsedPayload.hrProfile.address ? isDark ? 'text-slate-200' : 'text-slate-800' : 'text-slate-400'
                          }`}>
                            {parsedPayload.hrProfile.address || '—'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Contact & Banking Information Card (if any data available) */}
                    {(parsedPayload.hrProfile.mobile || parsedPayload.hrProfile.email || parsedPayload.hrProfile.bankAccount || parsedPayload.hrProfile.ifscCode) && (
                      <div className={`p-6 rounded-3xl border ${
                        isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                      }`}>
                        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-200 dark:border-slate-800">
                          <CreditCard className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                            Contact &amp; Banking Details
                          </h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          {parsedPayload.hrProfile.mobile && (
                            <div className={`p-3.5 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'}`}>
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Mobile</span>
                              <p className="text-sm font-bold truncate">{parsedPayload.hrProfile.mobile}</p>
                            </div>
                          )}
                          {parsedPayload.hrProfile.email && (
                            <div className={`p-3.5 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'}`}>
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Email</span>
                              <p className="text-sm font-bold truncate">{parsedPayload.hrProfile.email}</p>
                            </div>
                          )}
                          {parsedPayload.hrProfile.bankName && (
                            <div className={`p-3.5 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'}`}>
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Bank Name</span>
                              <p className="text-sm font-bold truncate">{parsedPayload.hrProfile.bankName}</p>
                            </div>
                          )}
                          {parsedPayload.hrProfile.bankAccount && (
                            <div className={`p-3.5 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'}`}>
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">Account Number</span>
                              <p className="text-sm font-bold font-mono truncate">{parsedPayload.hrProfile.bankAccount}</p>
                            </div>
                          )}
                          {parsedPayload.hrProfile.ifscCode && (
                            <div className={`p-3.5 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200/80'}`}>
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">IFSC Code</span>
                              <p className="text-sm font-bold font-mono truncate">{parsedPayload.hrProfile.ifscCode}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Quick Guideline Compliance Banner */}
                    {parsedPayload.totalRules > 0 && (
                      <div className={`p-5 rounded-3xl border flex items-center justify-between gap-4 ${
                        parsedPayload.overallCleared
                          ? isDark ? 'bg-emerald-950/20 border-emerald-800/40' : 'bg-emerald-50/70 border-emerald-200'
                          : isDark ? 'bg-rose-950/20 border-rose-800/40' : 'bg-rose-50/70 border-rose-200'
                      }`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                            parsedPayload.overallCleared
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                          }`}>
                            {parsedPayload.overallCleared ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0">
                            <h5 className="text-sm font-bold flex items-center gap-2 flex-wrap">
                              <span>Compliance Audit Status:</span>
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                                parsedPayload.overallCleared ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                              }`}>
                                {parsedPayload.overallCleared ? 'CLEARED' : 'UNCLEARED'} ({parsedPayload.passRate}% Pass Rate)
                              </span>
                            </h5>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {parsedPayload.clearedCount} of {parsedPayload.totalRules} verified compliance conditions satisfied.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setModalViewMode('guideline')}
                          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
                        >
                          <span>Open Guideline Audit</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Extracted Document Breakdown (Sectional Cards) */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                        <span>Extracted Documents &amp; Certificate Data</span>
                      </h4>
                      <CandidateProfileCard
                        extractedData={parsedPayload.mergedFields}
                        candidateName={parsedPayload.candidateName}
                        isDark={isDark}
                      />
                    </div>
                  </div>

                  {/* Right Pane: Original PDF / Document Preview */}
                  {showDocPreview && (
                    <div className="w-full lg:w-5/12 xl:w-2/5 h-full flex flex-col bg-slate-100 dark:bg-slate-900 border-t lg:border-t-0 flex-shrink-0">
                      {/* Document Viewer Header Bar */}
                      <div className={`flex items-center justify-between px-5 py-3 border-b flex-shrink-0 ${
                        isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                      }`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                          <span className="text-xs font-bold truncate">{selectedScan.filename}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
                            isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {selectedScan.pages_count} {selectedScan.pages_count === 1 ? 'page' : 'pages'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {docBlobUrl && (
                            <a
                              href={docBlobUrl}
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

                      {/* Document Viewer Stream Container */}
                      <div className="flex-1 w-full h-full relative overflow-hidden bg-slate-200/60 dark:bg-slate-950">
                        {loadingDocBlob ? (
                          <div className="flex flex-col items-center justify-center h-full gap-3 text-indigo-400">
                            <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                            <span className="text-xs font-semibold text-slate-400">Loading original PDF preview...</span>
                          </div>
                        ) : docBlobUrl ? (
                          <iframe
                            src={docBlobUrl}
                            title={`Original Document Preview - ${selectedScan.filename}`}
                            className="w-full h-full border-0"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-400 space-y-2">
                            <FileSearch className="w-10 h-10 opacity-30 text-indigo-400" />
                            <p className="text-xs font-bold text-slate-400">
                              {docBlobError || 'Original PDF document not available on disk.'}
                            </p>
                            <p className="text-[11px] text-slate-500 max-w-xs">
                              Cross-reference the verified data fields extracted into the profile panel.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : modalViewMode === 'guideline' ? (
                /* ============================================================ */
                /* 2. GUIDELINE COMPLIANCE & REASONING RESULTS (UNCHANGED)      */
                /* ============================================================ */
                <div className="h-full overflow-y-auto p-6 space-y-6">
                  {parsedPayload.totalRules === 0 ? (
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
                  )}
                </div>
                ) : (
                  /* ============================================================ */
                  /* 3. DEVELOPER JSON VIEW (UNCHANGED)                           */
                  /* ============================================================ */
                  <div className="h-full overflow-y-auto p-6 space-y-4">
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

                    <pre className={`text-xs font-mono p-4 rounded-2xl border overflow-auto max-h-[75vh] leading-relaxed whitespace-pre-wrap ${
                      isDark ? 'bg-slate-950/80 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}>
                      {JSON.stringify(activeJsonPayload || selectedScan.extracted_json, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
        );
      })()}

    </div>
  );
};

export default HomeDashboard;
