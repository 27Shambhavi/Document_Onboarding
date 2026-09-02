import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { documentsApi } from '../../api/documents';
import { companyApi } from '../../api/company';
import { storageUtil, getLabelFromId, formatGuidelineRule } from '../../utils/storage';
import type { StoredDocument } from '../../utils/storage';
import {
  Layers,
  CheckCircle2,
  XCircle,
  FolderInput,
  Lock,
  Sparkles,
  RefreshCw,
  Play,
  ArrowRight,
  Info,
  Check,
  Copy,
  Download,
  AlertTriangle
} from 'lucide-react';

const TOKENS = `
  @import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

  .dv-scope {
    font-family: 'Public Sans', ui-sans-serif, system-ui, sans-serif;
    color: var(--ink);
  }
  .dv-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

  /* Manifest Tickets */
  .dv-ticket {
    position: relative;
    display: grid;
    grid-template-columns: 64px 1px 1fr;
    align-items: stretch;
    background: var(--paper-2);
    border: 1px solid var(--line);
    transition: border-color 150ms ease, background 150ms ease;
    cursor: pointer;
    text-align: left;
    border-radius: 4px;
    overflow: hidden;
  }
  .dv-ticket:hover:not(:disabled) { border-color: var(--line-strong); }
  .dv-ticket[data-active="true"] {
    border-color: var(--verify);
    background: var(--verify-soft);
  }
  .dv-ticket-perf {
    background-image: radial-gradient(circle, var(--paper) 3px, transparent 3.5px);
    background-size: 8px 12px;
    background-position: center;
    background-repeat: repeat-y;
    width: 8px;
    position: relative;
    left: -4px;
  }
  .dv-ticket[data-active="true"] .dv-ticket-perf {
    background-image: radial-gradient(circle, var(--verify-soft) 3px, transparent 3.5px);
  }

  .dv-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    font-size: 11px;
    border: 1px solid var(--line);
    background: var(--paper-2);
    color: var(--ink-soft);
    border-radius: 2px;
    font-weight: 500;
  }

  /* Viewfinder Area */
  .dv-scan-zone {
    position: relative;
    border: 1px dashed var(--line-strong);
    background: var(--paper-2);
    border-radius: 4px;
    overflow: hidden;
    transition: border-color 150ms ease, background 150ms ease;
  }
  .dv-scan-zone[data-drag="true"] { border-color: var(--verify); border-style: solid; background: var(--verify-soft); }
  .dv-bracket { position: absolute; width: 18px; height: 18px; border-color: var(--ink); opacity: 0.5; }
  .dv-scan-zone[data-drag="true"] .dv-bracket { border-color: var(--verify); opacity: 1; }
  .dv-bracket.tl { top: 12px; left: 12px; border-top: 2px solid; border-left: 2px solid; }
  .dv-bracket.tr { top: 12px; right: 12px; border-top: 2px solid; border-right: 2px solid; }
  .dv-bracket.bl { bottom: 12px; left: 12px; border-bottom: 2px solid; border-left: 2px solid; }
  .dv-bracket.br { bottom: 12px; right: 12px; border-bottom: 2px solid; border-right: 2px solid; }

  .dv-scanline {
    position: absolute; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, transparent, var(--verify), transparent);
    box-shadow: 0 0 6px var(--verify);
    animation: dv-sweep 1.8s linear infinite;
    opacity: 0;
  }
  .dv-scan-zone[data-drag="true"] .dv-scanline { opacity: 1; }
  @keyframes dv-sweep { 0% { top: 6%; } 100% { top: 94%; } }

  /* Ledger Sidebar steps */
  .dv-ledger {
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 4px;
  }
  .dv-ledger-item { position: relative; padding-left: 38px; }
  .dv-ledger-code {
    position: absolute; left: 0; top: 1px; width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center; font-size: 10px;
    border: 1px solid var(--line-strong); color: var(--ink-soft);
    border-radius: 2px;
    font-weight: 600;
    background: var(--paper-2);
  }
  .dv-ledger-item[data-status="done"] .dv-ledger-code { background: var(--verify); border-color: var(--verify); color: #fff; }
  .dv-ledger-item[data-status="active"] .dv-ledger-code { background: var(--ink); border-color: var(--ink); color: #fff; }
  .dv-ledger-item[data-status="amber"] .dv-ledger-code { background: var(--amber); border-color: var(--amber); color: #fff; }
  .dv-ledger-item[data-status="skipped"] { opacity: 0.45; }
  .dv-ledger-item[data-status="skipped"] .dv-ledger-code {
    background: var(--paper-2);
    border-color: var(--line);
    color: var(--ink-soft);
    text-decoration: line-through;
  }
  .dv-ledger-rule { position: absolute; left: 11px; top: 25px; bottom: -20px; width: 1px; background: var(--line); }
  .dv-ledger-item:last-child .dv-ledger-rule { display: none; }

  /* Interactive Switch */
  .dv-switch {
    width: 32px; height: 18px; border: 1px solid var(--line-strong); border-radius: 9px; position: relative; cursor: pointer; flex-shrink: 0;
    background: var(--paper-2);
    transition: background 120ms ease, border-color 120ms ease;
  }
  .dv-switch[data-on="true"] { background: var(--verify); border-color: var(--verify); }
  .dv-switch[data-locked="true"] { opacity: 0.6; cursor: not-allowed; background: var(--paper-2); }
  .dv-switch-knob { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; transition: left 120ms ease; }
  .dv-switch[data-on="true"] .dv-switch-knob { left: 16px; }

  /* Editable fields */
  .dv-field-row input {
    font-family: 'JetBrains Mono', monospace; font-size: 12.5px; border: 1px solid var(--line);
    padding: 6px 10px; width: 100%; background: var(--paper); color: var(--ink);
    border-radius: 2px;
  }
  .dv-field-row input:focus { outline: none; border-color: var(--verify); }
`;

interface ExtractedFieldInput {
  docId: string;
  docLabel: string;
  fieldKey: string;
  fieldValue: string;
}

export const UploadDocuments: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States
  const [auditMode, setAuditMode] = useState<'one_pass' | 'two_stage'>('one_pass');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Pipeline settings loaded from API
  const [companyName, setCompanyName] = useState('Technova Solutions Pvt Ltd');
  const [pricePerPage, setPricePerPage] = useState(5);
  const [pricePerSignature, setPricePerSignature] = useState(2);
  const [currency, setCurrency] = useState('INR');
  const [isSignatureAddonEnabled, setIsSignatureAddonEnabled] = useState(false);
  const [blueprintTypes, setBlueprintTypes] = useState<string[]>([]);
  const [activeGuidelines, setActiveGuidelines] = useState<string[]>([]);

  // Toggle state
  const [sigDetectionOn, setSigDetectionOn] = useState(false);

  // Run progress states
  const [stageIndex, setStageIndex] = useState(0); // 0: Idle, 1: Upload, 2: Split, 3: Vision, 4: Stitch, 5: Verify, 6: Billed
  const [awaitingReview, setAwaitingReview] = useState(false);

  // Raw API outputs & parsed files
  const [rawResponse, setRawResponse] = useState<any>(null);
  const [processedDocs, setProcessedDocs] = useState<StoredDocument[]>([]);
  const [activeResultTab, setActiveResultTab] = useState<'overview' | 'json'>('overview');
  const [copied, setCopied] = useState(false);

  // Intermediate values for review
  const [stage1OCRData, setStage1OCRData] = useState<any>(null);
  const [reviewFields, setReviewFields] = useState<ExtractedFieldInput[]>([]);

  // Simulation estimates
  const [simulatedPageCount, setSimulatedPageCount] = useState<number | null>(null);
  const [actualSignatureCount, setActualSignatureCount] = useState<number | null>(null);

  // Load tenant profile & settings on mount
  useEffect(() => {
    const loadConfiguration = async () => {
      try {
        // 1. Fetch usage details for signature addon check & pricing
        const usage: any = await companyApi.getClientUsageSummary();
        if (usage) {
          setCompanyName(usage.company_name || 'Technova Solutions Pvt Ltd');
          setIsSignatureAddonEnabled(usage.signature_addon_active);
          if (usage.signature_addon_active) {
            setSigDetectionOn(true); // default true if allowed
          }
          if (usage.billing_summary) {
            setPricePerPage(usage.billing_summary.rate_per_page ?? 5);
            setPricePerSignature(usage.billing_summary.rate_per_signature ?? 2);
            setCurrency(usage.billing_summary.currency ?? 'INR');
          }
        }
      } catch (err) {
        console.warn('Could not retrieve company metrics summary, utilizing default parameters.');
      }

      try {
        // 2. Fetch blueprint types
        const res = await companyApi.getBlueprint();
        if (res && res.blueprint) {
          setBlueprintTypes(Object.keys(res.blueprint));
        } else {
          // Fallback blueprint types matching guidelines
          setBlueprintTypes(['resume', 'pan_card', 'aadhaar_card']);
        }
      } catch (err) {
        setBlueprintTypes(['resume', 'pan_card', 'aadhaar_card']);
      }

      try {
        // 3. Fetch active guidelines
        const res = await companyApi.getGuidelines();
        if (res && res.guidelines) {
          setActiveGuidelines(res.guidelines);
        } else {
          setActiveGuidelines([
            'Resume must contain Candidate Name, Email ID, and Mobile Number.',
            'PAN Card must contain Name, Date of Birth, and a valid PAN Number.',
            'Aadhaar Card must contain Name, Date of Birth, and Address.',
            'Candidate Name on PAN Card must match the name provided on Aadhaar Card.'
          ]);
        }
      } catch (err) {
        setActiveGuidelines([
          'Resume must contain Candidate Name, Email ID, and Mobile Number.',
          'PAN Card must contain Name, Date of Birth, and a valid PAN Number.',
          'Aadhaar Card must contain Name, Date of Birth, and Address.',
          'Candidate Name on PAN Card must match the name provided on Aadhaar Card.'
        ]);
      }
    };

    loadConfiguration();
  }, []);

  // File drop helpers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (['.pdf', '.zip'].includes(extension)) {
        setSelectedFile(file);
        // Estimate pages before running (visual placeholder)
        setSimulatedPageCount(3 + Math.floor(Math.random() * 3));
        setStageIndex(0);
        setError(null);
        setRawResponse(null);
        setProcessedDocs([]);
        setAwaitingReview(false);
      } else {
        setError('Unsupported format. Only PDF and ZIP bundles are supported.');
      }
    }
  };

  const handleBrowseFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setSimulatedPageCount(3 + Math.floor(Math.random() * 3));
      setStageIndex(0);
      setError(null);
      setRawResponse(null);
      setProcessedDocs([]);
      setAwaitingReview(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setSourceUrl('');
    setSimulatedPageCount(null);
    setActualSignatureCount(null);
    setStageIndex(0);
    setError(null);
    setRawResponse(null);
    setProcessedDocs([]);
    setAwaitingReview(false);
    setReviewFields([]);
    setStage1OCRData(null);
  };

  // Stepped ledger simulation runner
  const advanceLedgerTo = async (targetStep: number, delayMs: number = 800) => {
    for (let i = stageIndex + 1; i <= targetStep; i++) {
      setStageIndex(i);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  };

  // Start Pipeline Audit
  const handleStartAudit = async () => {
    const trimmedUrl = sourceUrl.trim();

    // Support all three modes:
    // 1. file only
    // 2. file + URL
    // 3. URL only
    if (!selectedFile && !trimmedUrl) {
      setError('Please upload a PDF/ZIP file or provide a document URL.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setRawResponse(null);
    setProcessedDocs([]);

    const uploadedAt = new Date().toISOString();

    if (auditMode === 'one_pass') {
      try {
        setStageIndex(1); // Upload completed
        await advanceLedgerTo(2); // Splitting pages

        // Dispatches the single-pass OCR vision pipeline
        const responseData = await documentsApi.processDocumentOcr(
          selectedFile || undefined,
          sigDetectionOn,
          trimmedUrl || undefined
        );
        
        await advanceLedgerTo(3); // Vision inference completed
        await advanceLedgerTo(4); // Contiguous page stitching completed

        setRawResponse(responseData);

        if (responseData && responseData.documents) {
          setSimulatedPageCount(responseData.total_pages || 4);
          setActualSignatureCount(responseData.total_signatures_detected ?? 0);

          const mappedDocs: StoredDocument[] = responseData.documents.map((doc: any) => {
            const hasIssue = doc.extracted_data?.doc_quality === 'Bad';
            return {
              id: doc.id,
              filename: selectedFile?.name || 'document-from-url',
              requestId: responseData.request_id || 'REQ-UNKNOWN',
              companyId: responseData.company_id || 'COMPANY',
              label: getLabelFromId(doc.id, doc.document_type),
              status: hasIssue ? 'QUALITY_FAILED' as const : 'PROCESSED' as const,
              pages: doc.pages?.length || 1,
              uploadedAt,
              qualityStatus: hasIssue ? 'FAILED' as const : 'PASSED' as const,
              qualityReason: doc.extracted_data?.doc_quality_issues || 'Clear readability checks.',
              extractedData: doc.extracted_data || {},
              clearedGuidelines: [],
              unclearedGuidelines: [],
              rawJson: doc
            };
          });

          storageUtil.saveDocuments(mappedDocs);
          setProcessedDocs(mappedDocs);
        }

        // Under one-pass, guidelines verification is skipped
        setStageIndex(6); // Skip step 5 and go straight to billing metering
      } catch (err: any) {
        console.error(err);
        setStageIndex(0);
        const detail = err.response?.data?.detail;
        setError(typeof detail === 'string' ? detail : 'Vision inference processing failed. Ensure blueprint registry is configured.');
      } finally {
        setIsLoading(false);
      }
    } else {
      // Two-Stage Audit - Stage 1
      try {
        setStageIndex(1); // Upload completed
        await advanceLedgerTo(2); // Splitting pages

        const responseData = await documentsApi.stage1ExtractOcr(
          selectedFile || undefined,
          trimmedUrl || undefined
        );

        await advanceLedgerTo(3); // OCR inference completed
        await advanceLedgerTo(4); // Stitched document pages completed

        setRawResponse(responseData);
        setStage1OCRData(responseData);

        if (responseData && responseData.candidates_ocr_data) {
          const firstCand = responseData.candidates_ocr_data[0];
          setSimulatedPageCount(firstCand?.total_documents_detected || 4);
          // Standard estimate: signature check addon scans are done during Vision task 
          setActualSignatureCount(sigDetectionOn ? Math.max(1, Math.floor(Math.random() * 2)) : 0);

          const mappedDocs: StoredDocument[] = [];
          const fieldsList: ExtractedFieldInput[] = [];

          responseData.candidates_ocr_data.forEach((cand: any) => {
            cand.files?.forEach((file: any) => {
              const doc: StoredDocument = {
                id: file.id,
                filename: cand.candidate_file || selectedFile?.name || 'document-from-url',
                requestId: cand.requestId || 'REQ-STAGE1',
                companyId: responseData.company_id || 'COMPANY',
                label: getLabelFromId(file.id, file.label),
                status: file.ocr_data?.doc_quality === 'Bad' ? 'QUALITY_FAILED' : 'PROCESSED',
                pages: cand.total_documents_detected || 1,
                uploadedAt,
                qualityStatus: file.ocr_data?.doc_quality === 'Bad' ? 'FAILED' : 'PASSED',
                qualityReason: file.ocr_data?.doc_quality_issues || 'Clear readability checks.',
                extractedData: file.ocr_data || {},
                clearedGuidelines: [],
                unclearedGuidelines: [],
                rawJson: file
              };
              mappedDocs.push(doc);

              // Gather editable business fields (ignore quality metadata)
              Object.entries(file.ocr_data || {}).forEach(([key, val]) => {
                if (!['doc_quality', 'doc_quality_issues', '_quality_status', '_confidence'].includes(key)) {
                  fieldsList.push({
                    docId: file.id,
                    docLabel: getLabelFromId(file.id, file.label),
                    fieldKey: key,
                    fieldValue: String(val)
                  });
                }
              });
            });
          });

          storageUtil.saveDocuments(mappedDocs);
          setProcessedDocs(mappedDocs);
          setReviewFields(fieldsList);
          setAwaitingReview(true);
        }
      } catch (err: any) {
        console.error(err);
        setStageIndex(0);
        const detail = err.response?.data?.detail;
        setError(typeof detail === 'string' ? detail : 'Stage 1 extraction pipeline failed.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Run Stage 2 manual guidelines checks (Two-stage only)
  const handleRunStage2 = async () => {
    if (!stage1OCRData || processedDocs.length === 0) return;
    setIsLoading(true);
    setError(null);
    setAwaitingReview(false);

    try {
      setStageIndex(5); // Guidelines checking active

      // 1. Rebuild the payload with modified inputs
      const candidatesPayload = JSON.parse(JSON.stringify(stage1OCRData.candidates_ocr_data));
      candidatesPayload.forEach((cand: any) => {
        cand.files?.forEach((file: any) => {
          // Re-inject edited fields
          const updatedOcr: any = { ...file.ocr_data };
          reviewFields.forEach((edit) => {
            if (edit.docId === file.id) {
              updatedOcr[edit.fieldKey] = edit.fieldValue;
            }
          });
          file.ocr_data = updatedOcr;
        });
      });

      // 2. Dispatch guidelines verification to reasoning layer
      const stage2Response = await documentsApi.stage2VerifyGuidelines(candidatesPayload);
      setRawResponse(stage2Response);

      console.log("STAGE2 RESPONSE", stage2Response);
      console.log(
        "STAGE2 VERDICT IDS",
        stage2Response.verified_candidates?.flatMap(
          (c: any) => c.guideline?.map((g: any) => g.id) || []
        )
      );
      console.log(
        "STORED DOCUMENT IDS",
        storageUtil.getDocuments().map((d) => d.id)
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));
      await advanceLedgerTo(6); // Finalized billing metering

      // 3. Map verifications back into processed documents by exact document ID
      const verdictMap = new Map<string, any>();
      stage2Response.verified_candidates?.forEach((candidate: any) => {
        candidate.guideline?.forEach((verdict: any) => {
          if (verdict?.id) {
            verdictMap.set(verdict.id, verdict);
          }
        });
      });

      const updatedDocs = processedDocs.map((doc) => {
        const matchingVerdict = verdictMap.get(doc.id);

        // Update document ocr details with latest edits
        const updatedOcr: any = { ...doc.extractedData };
        reviewFields.forEach((edit) => {
          if (edit.docId === doc.id) {
            updatedOcr[edit.fieldKey] = edit.fieldValue;
          }
        });

        if (matchingVerdict) {
          const clearedGuidelines = Array.isArray(matchingVerdict.cleared_guidelines)
            ? matchingVerdict.cleared_guidelines
            : [];
          const unclearedGuidelines = Array.isArray(matchingVerdict.uncleared_guidelines)
            ? matchingVerdict.uncleared_guidelines
            : [];

          let updatedStatus: StoredDocument['status'] = doc.status;
          if (doc.qualityStatus === 'FAILED') {
            updatedStatus = 'QUALITY_FAILED';
          } else if (unclearedGuidelines.length > 0) {
            updatedStatus = 'ACTION_REQUIRED';
          } else if (clearedGuidelines.length > 0) {
            updatedStatus = 'PROCESSED';
          }

          return {
            ...doc,
            extractedData: updatedOcr,
            status: updatedStatus,
            clearedGuidelines,
            unclearedGuidelines,
            rawJson: doc.rawJson,
          };
        }

        return {
          ...doc,
          extractedData: updatedOcr,
        };
      });

      console.log("UPDATED DOCUMENTS", updatedDocs);
      storageUtil.saveDocuments(updatedDocs);
      setProcessedDocs(updatedDocs);
    } catch (err: any) {
      console.error(err);
      setError('Stage 2 guideline reasoning verification could not be completed.');
      setAwaitingReview(true); // Return back to review state
      setStageIndex(4);
    } finally {
      setIsLoading(false);
    }
  };

  // Export results helpers
  const handleCopyJson = () => {
    if (!rawResponse) return;
    navigator.clipboard.writeText(JSON.stringify(rawResponse, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadJson = () => {
    if (!rawResponse) return;
    const blob = new Blob([JSON.stringify(rawResponse, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `docverify-audit-${rawResponse.request_id || rawResponse.requestId || 'export'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Running billing estimate
  const currentPricePerPage = pricePerPage;
  const currentPricePerSignature = pricePerSignature;
  
  const hasDocumentSource = Boolean(selectedFile || sourceUrl.trim());

  const estimatedCost = hasDocumentSource && simulatedPageCount !== null
    ? (simulatedPageCount * currentPricePerPage) + ((actualSignatureCount ?? (sigDetectionOn ? 1 : 0)) * currentPricePerSignature)
    : null;

  // Ledger Step Builders
  const getStepStatus = (stepNo: number) => {
    if (stageIndex >= stepNo) {
      if (stepNo === 5 && auditMode === 'one_pass') return 'skipped';
      return 'done';
    }
    if (stageIndex + 1 === stepNo) {
      if (stepNo === 5 && awaitingReview) return 'amber';
      return 'active';
    }
    return 'pending';
  };

  const steps = [
    { code: '01', title: 'Upload candidate bundle', desc: 'Accept PDF or ZIP file contexts.' },
    { code: '02', title: 'Normalize and split pages', desc: 'Pre-renders PDF document pages for inference.' },
    { code: '03', title: 'Run vision inference', desc: 'Evaluates type classification, field extraction, and signature detection.' },
    { code: '04', title: 'Stitch page contracts', desc: 'Merges contiguous page sections into structured files.' },
    { code: '05', title: 'Run guidelines verification', desc: auditMode === 'one_pass' ? 'Skipped for one-pass audit.' : 'Resolves compliance checklists with LLM reasoning.' },
    { code: '06', title: 'Meter usage & finalize billing', desc: 'Logs scan logs to usage ledger.' },
  ];

  // Build guideline rows ONLY from the backend Stage-2 verdicts.
  // The frontend must never calculate CLEARED/UNCLEARED itself.
  const getGuidelineRows = (): {
    id: string;
    rule: string;
    status: 'CLEARED' | 'UNCLEARED';
    explanation: string;
  }[] => {
    const rows: {
      id: string;
      rule: string;
      status: 'CLEARED' | 'UNCLEARED';
      explanation: string;
    }[] = [];

    processedDocs.forEach((doc) => {
      const cleared = Array.isArray(doc.clearedGuidelines)
        ? doc.clearedGuidelines
        : [];
      const uncleared = Array.isArray(doc.unclearedGuidelines)
        ? doc.unclearedGuidelines
        : [];

      cleared.forEach((rule, index) => {
        rows.push({
          id: `CLEARED-${doc.id}-${index + 1}`,
          rule: String(rule),
          status: 'CLEARED',
          explanation: `${doc.label} cleared this compliance rule according to Stage 2 verification.`
        });
      });

      uncleared.forEach((rule, index) => {
        rows.push({
          id: `UNCLEARED-${doc.id}-${index + 1}`,
          rule: String(rule),
          status: 'UNCLEARED',
          explanation: `${doc.label} did not clear this compliance rule according to Stage 2 verification.`
        });
      });
    });

    return rows;
  };

  const guidelineRows = getGuidelineRows();

  return (
    <div className="dv-scope space-y-6">
      <style>{TOKENS}</style>

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Upload documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Perform onboarding audits for {companyName}. Powered by FastAPI, PostgreSQL and Vision LLMs.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="space-y-6">
          
          {/* Mode Selector */}
          <section className="bg-card border border-border rounded p-5 space-y-3">
            <p className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Choose an audit pipeline</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <button
                disabled={isLoading || stageIndex > 0 && stageIndex < 6}
                data-active={auditMode === 'one_pass'}
                onClick={() => setAuditMode('one_pass')}
                className="dv-ticket disabled:opacity-50"
              >
                <div className="flex items-center justify-center p-3">
                  <Sparkles size={20} className={auditMode === 'one_pass' ? 'text-[#1F7A5C]' : 'text-muted-foreground'} />
                </div>
                <div className="dv-ticket-perf" />
                <div className="p-3.5">
                  <p className="text-sm font-semibold mb-0.5">One-pass audit</p>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    Single vision inference call runs scoring, type classification, and field extraction. Fast, fully automatic, no checkpoints.
                  </p>
                </div>
              </button>

              <button
                disabled={isLoading || stageIndex > 0 && stageIndex < 6}
                data-active={auditMode === 'two_stage'}
                onClick={() => setAuditMode('two_stage')}
                className="dv-ticket disabled:opacity-50"
              >
                <div className="flex items-center justify-center p-3">
                  <Layers size={20} className={auditMode === 'two_stage' ? 'text-[#1F7A5C]' : 'text-muted-foreground'} />
                </div>
                <div className="dv-ticket-perf" />
                <div className="p-3.5">
                  <p className="text-sm font-semibold mb-0.5">Two-stage audit</p>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    Stops after extraction so you can correct details. Manually trigger guideline rules audits against LLM reasoning layer.
                  </p>
                </div>
              </button>

            </div>
          </section>

          {/* Intake Dropzone */}
          <section className="bg-card border border-border rounded p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
              <p className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Candidate document bundle</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mr-1">Expected blueprint:</span>
                {blueprintTypes.map((t) => (
                  <span key={t} className="dv-chip dv-mono text-[10px]">{t}</span>
                ))}
                {activeGuidelines.length > 0 && (
                  <span className="dv-chip dv-mono text-[10px]">guidelines: {activeGuidelines.length}</span>
                )}
              </div>
            </div>

            <div
              className="dv-scan-zone flex flex-col items-center justify-center text-center py-10 px-4 min-h-[180px]"
              data-drag={dragActive}
              onDragOver={handleDrag}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
            >
              <span className="dv-bracket tl" />
              <span className="dv-bracket tr" />
              <span className="dv-bracket bl" />
              <span className="dv-bracket br" />
              <span className="dv-scanline" />

              <FolderInput size={28} className={`mb-3 ${dragActive ? 'text-[#1F7A5C]' : 'text-muted-foreground'}`} />

              {selectedFile ? (
                <div className="space-y-1">
                  <p className="text-sm font-semibold dv-mono text-foreground">{selectedFile?.name || 'document-from-url'}</p>
                  <p className="text-[12px] text-muted-foreground dv-mono">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {simulatedPageCount} pages estimated
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-foreground">
                    Drag the bundle here, or{' '}
                    <button
                      type="button"
                      className="underline font-semibold text-[#1F7A5C]"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      browse files
                    </button>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Accepts PDF or ZIP bundles up to 50MB
                  </p>
                  {sourceUrl.trim() && (
                    <p className="text-[10px] text-[var(--verify)] dv-mono">
                      URL source provided — file upload is optional
                    </p>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.zip"
                className="hidden"
                onChange={handleBrowseFile}
              />
            </div>

            {/* Optional source document URL */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <p className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">
                  Document URL
                </p>
                <span className="text-[10px] text-muted-foreground">
                  Optional — works with file upload or by itself
                </span>
              </div>

              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => {
                  setSourceUrl(e.target.value);
                  setError(null);
                }}
                placeholder="https://drive.google.com/file/d/.../view"
                disabled={isLoading}
                className="h-[42px] w-full rounded border border-border bg-[var(--paper)] px-3 text-xs dv-mono text-foreground placeholder:text-muted-foreground/60 focus:border-[var(--verify)] focus:outline-none disabled:opacity-60"
              />

              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Provide the URL of the source document. You can upload a file,
                provide a URL, or provide both.
              </p>
            </div>

            {/* Toggle Addon and CTA actions */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2 border-t border-border">
              
              {/* Premium toggle */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-on={sigDetectionOn}
                  data-locked={!isSignatureAddonEnabled}
                  onClick={() => isSignatureAddonEnabled && setSigDetectionOn(!sigDetectionOn)}
                  className="dv-switch"
                >
                  <span className="dv-switch-knob" />
                </button>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Detect signatures & stamps</span>
                  {isSignatureAddonEnabled ? (
                    <span className="dv-mono text-[10px] text-emerald-600 bg-emerald-50 px-1 border border-emerald-200">ADDON ACTIVE</span>
                  ) : (
                    <span className="flex items-center gap-0.5 dv-mono text-[10px] text-amber-600 bg-amber-50 px-1 border border-amber-200">
                      <Lock size={10} /> LOCKED (PREMIUM)
                    </span>
                  )}
                </div>
              </div>

              {/* Running cost and Start audit */}
              <div className="flex items-center justify-end gap-4">
                {estimatedCost !== null && (
                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground">
                      Running cost estimate:{' '}
                      <span className="dv-mono font-bold text-foreground">
                        {currency} {estimatedCost}
                      </span>
                    </p>
                    {actualSignatureCount === null && sigDetectionOn && (
                      <p className="text-[9px] text-amber-600 dv-mono">Pending signature check scan</p>
                    )}
                  </div>
                )}
                
                {hasDocumentSource && (
                  <button
                    disabled={isLoading || (stageIndex > 0 && stageIndex < 6)}
                    onClick={handleStartAudit}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#14181F] text-white hover:bg-neutral-800 disabled:opacity-50 text-xs font-semibold uppercase tracking-wider rounded"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" />
                        Start audit
                      </>
                    )}
                  </button>
                )}
              </div>

            </div>
          </section>

          {/* Errors display */}
          {error && (
            <div className="flex items-start gap-3 p-4 bg-[var(--uncleared-soft)] border border-[var(--uncleared)] text-[var(--uncleared)] rounded">
              <XCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold">Compliance check failed</p>
                <p className="mt-0.5 font-mono">{error}</p>
              </div>
            </div>
          )}

          {/* Two-Stage review panel */}
          {awaitingReview && reviewFields.length > 0 && (
            <section className="border border-[var(--amber)] bg-[var(--amber-soft)] p-5 rounded space-y-4">
              <div className="flex items-start gap-2.5">
                <Info size={16} className="text-[var(--amber)] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[var(--amber)]">Stage 1 complete — review extracted fields</p>
                  <p className="text-xs text-muted-foreground">
                    Correct any optical character recognition errors below before launching guidelines evaluation on the reasoning layer.
                  </p>
                </div>
              </div>

              {/* Grouped by document */}
              <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
                {processedDocs.map((doc) => {
                  const docFields = reviewFields.filter(f => f.docId === doc.id);
                  if (docFields.length === 0) return null;
                  
                  return (
                    <div key={doc.id} className="bg-[var(--paper-2)] border border-[var(--line)] p-4 rounded space-y-3">
                      <div className="flex items-center gap-2 border-b pb-1.5 border-[var(--line)]">
                        <span className="text-[11px] font-semibold dv-mono bg-[var(--paper)] text-[var(--ink-soft)] px-1.5 py-0.5 rounded">
                          {doc.id}
                        </span>
                        <span className="text-xs font-bold text-foreground">
                          {doc.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {docFields.map((field) => (
                          <div key={field.fieldKey} className="dv-field-row">
                            <label className="text-[11px] font-bold text-muted-foreground block mb-0.5 dv-mono">
                              {formatGuidelineRule(field.fieldKey)}
                            </label>
                            <input
                              type="text"
                              value={field.fieldValue}
                              onChange={(e) => {
                                const val = e.target.value;
                                setReviewFields(prev => prev.map(f => 
                                  (f.docId === field.docId && f.fieldKey === field.fieldKey) ? { ...f, fieldValue: val } : f
                                ));
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  disabled={isLoading}
                  onClick={handleRunStage2}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[var(--verify)] text-[var(--paper)] hover:opacity-90 text-xs font-semibold uppercase tracking-wider rounded"
                >
                  <Play className="h-3.5 w-3.5" />
                  Run guidelines verification
                </button>
              </div>
            </section>
          )}

          {/* Results dashboard overview */}
          {processedDocs.length > 0 && !awaitingReview && (
            <section className="bg-[var(--paper-2)] border border-[var(--line)] rounded overflow-hidden">
              
              {/* Tabs header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-[var(--paper-2)] border-b border-[var(--line)] gap-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${
                    processedDocs.some(d => d.status === 'ACTION_REQUIRED' || d.status === 'QUALITY_FAILED')
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`} />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Compliance audit report</p>
                    {rawResponse && (
                      <p className="text-[10px] text-muted-foreground dv-mono">
                        REQUEST: {rawResponse.request_id || rawResponse.requestId || 'REQ-COMPLETED'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex bg-[var(--paper-2)] p-0.5 rounded border border-[var(--line)]">
                    <button
                      onClick={() => setActiveResultTab('overview')}
                      className={`px-3 py-1 text-[11px] font-semibold rounded-sm ${
                        activeResultTab === 'overview'
                          ? 'bg-[var(--line-strong)] text-[var(--ink)]'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Report overview
                    </button>
                    <button
                      onClick={() => setActiveResultTab('json')}
                      className={`px-3 py-1 text-[11px] font-semibold rounded-sm ${
                        activeResultTab === 'json'
                          ? 'bg-[var(--line-strong)] text-[var(--ink)]'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Raw JSON logs
                    </button>
                  </div>
                  <button
                    onClick={handleReset}
                    className="px-3 py-1 text-[11px] border border-[var(--line)] bg-[var(--paper-2)] hover:bg-[var(--paper)] rounded"
                  >
                    Clear run
                  </button>
                </div>
              </div>

              {/* Overview Tab Content */}
              {activeResultTab === 'overview' ? (
                <div className="p-4 space-y-6">

                  {/* Guideline reasoning outcomes for two-stage audit */}
                  {auditMode === 'two_stage' && stageIndex >= 5 && guidelineRows.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Guideline reasoning outcomes</p>
                      
                      <div className="divide-y divide-border border rounded overflow-hidden">
                        {guidelineRows.map((row) => {
                          const cleared = row.status === 'CLEARED';
                          return (
                            <div
                              key={row.id}
                              className={`flex gap-3 items-start p-4 border rounded border-opacity-35 ${
                                cleared ? 'bg-[var(--verify-soft)] border-[var(--verify)]' : 'bg-[var(--uncleared-soft)] border-[var(--uncleared)]'
                              }`}
                            >
                              {cleared ? (
                                <CheckCircle2 size={16} className="text-[var(--verify)] flex-shrink-0 mt-0.5" />
                              ) : (
                                <XCircle size={16} className="text-[var(--uncleared)] flex-shrink-0 mt-0.5" />
                              )}
                              
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-[10px] font-bold dv-mono text-muted-foreground">{row.id}</span>
                                  <span
                                    className={`text-[9px] px-1.5 py-0.2 dv-mono rounded font-bold uppercase tracking-wider ${
                                      cleared ? 'text-[var(--verify)]' : 'text-[var(--uncleared)]'
                                    }`}
                                  >
                                    {row.status}
                                  </span>
                                </div>
                                <p className="text-xs font-semibold text-foreground">{row.rule}</p>
                                <p className={`text-[11px] mt-0.5 ${cleared ? 'text-[var(--verify)] font-medium' : 'text-[var(--uncleared)] font-medium'}`}>
                                  {row.explanation}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* One-pass skipped guidelines notice */}
                  {auditMode === 'one_pass' && (
                    <div className="flex items-start gap-2.5 p-3.5 bg-[var(--paper-2)] border border-[var(--line)] rounded text-xs text-muted-foreground">
                      <Info size={15} className="mt-0.5 text-[var(--ink-soft)]" />
                      <div>
                        <p className="font-semibold text-[var(--ink)]">Guidelines reasoning omitted</p>
                        <p className="mt-0.5 leading-relaxed">
                          In one-pass audit pipeline mode, guidelines logic reasoning checks are skipped to optimize processing latency. Stitched OCR data is saved directly.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Documents list */}
                  <div className="space-y-4">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Processed logical documents</p>
                    
                    <div className="space-y-4">
                      {processedDocs.map((doc) => (
                        <div key={doc.id} className="border rounded overflow-hidden">
                          {/* File header */}
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-[var(--paper-2)] px-4 py-2.5 border-b border-[var(--line)] gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] dv-mono bg-[var(--paper)] border border-[var(--line)] px-1.5 py-0.5 rounded font-semibold">
                                {doc.id}
                              </span>
                              <span className="text-xs font-bold text-foreground">
                                {doc.label}
                              </span>
                            </div>
                            
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider dv-mono border ${
                                doc.status === 'PROCESSED'
                                  ? 'bg-[var(--verify-soft)] text-[var(--verify)] border-[var(--verify)]/20'
                                  : doc.status === 'QUALITY_FAILED'
                                  ? 'bg-[var(--uncleared-soft)] text-[var(--uncleared)] border-[var(--uncleared)]/20'
                                  : 'bg-[var(--amber-soft)] text-[var(--amber)] border-[var(--amber)]/20'
                              }`}
                            >
                              {doc.status.replace('_', ' ')}
                            </span>
                          </div>

                          {/* File content */}
                          <div className="p-4 space-y-4">
                            
                            {/* Quality check */}
                            <div className="flex items-start gap-2.5 p-3 bg-[var(--paper-2)] border border-[var(--line)] rounded text-xs">
                              {doc.qualityStatus === 'PASSED' ? (
                                <CheckCircle2 size={15} className="text-[var(--verify)] mt-0.5" />
                              ) : (
                                <AlertTriangle size={15} className="text-[var(--amber)] mt-0.5" />
                              )}
                              <div>
                                <p className="font-semibold text-foreground">Quality Check: {doc.qualityStatus}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{doc.qualityReason}</p>
                              </div>
                            </div>

                            {/* Extracted fields */}
                            {doc.extractedData && Object.keys(doc.extractedData).filter(k => !['doc_quality', 'doc_quality_issues', '_quality_status', '_confidence'].includes(k)).length > 0 && (
                              <div className="space-y-1.5">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest dv-mono">Extracted fields metadata</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 bg-[var(--paper-2)] border border-[var(--line)] rounded dv-mono text-[11px]">
                                  {Object.entries(doc.extractedData)
                                    .filter(([k]) => !['doc_quality', 'doc_quality_issues', '_quality_status', '_confidence'].includes(k))
                                    .map(([k, val]) => (
                                      <div key={k} className="flex justify-between border-b border-[var(--line)] py-1 truncate">
                                        <span className="text-muted-foreground mr-3">{formatGuidelineRule(k)}</span>
                                        <span className="font-semibold text-foreground truncate select-all">{String(val)}</span>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}

                            {/* Link to detail page */}
                            <div className="flex justify-end border-t pt-3">
                              <button
                                onClick={() => navigate(`/company/documents/${doc.id}`)}
                                className="flex items-center gap-1 text-[11px] font-semibold text-[#1F7A5C] hover:underline"
                              >
                                View full dossier
                                <ArrowRight size={12} />
                              </button>
                            </div>

                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              ) : (
                <div className="flex flex-col">
                  {/* JSON action bar */}
                  <div className="flex items-center justify-between p-3 bg-neutral-50 border-b border-border">
                    <span className="text-xs font-semibold text-muted-foreground dv-mono">Raw compliance payload logs</span>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCopyJson}
                        className="flex items-center gap-1.5 px-3 py-1 text-xs border border-border bg-white hover:bg-neutral-50 rounded"
                      >
                        {copied ? <Check size={12} className="text-[#1F7A5C]" /> : <Copy size={12} />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        onClick={handleDownloadJson}
                        className="flex items-center gap-1.5 px-3 py-1 text-xs border border-border bg-white hover:bg-neutral-50 rounded"
                      >
                        <Download size={12} />
                        Download
                      </button>
                    </div>
                  </div>
                  <pre className="p-4 bg-neutral-900 text-neutral-100 dv-mono text-[11px] leading-relaxed overflow-x-auto max-h-[480px]">
                    {JSON.stringify(rawResponse, null, 2)}
                  </pre>
                </div>
              )}

            </section>
          )}

        </div>

        {/* Audit Flow Ledger Sidebar */}
        <aside className="dv-ledger p-5 space-y-4">
          <p className="text-[12px] font-bold text-muted-foreground uppercase tracking-wider">Document audit ledger</p>
          <div className="space-y-6">
            {steps.map((step, idx) => {
              const stepNo = idx + 1;
              const status = getStepStatus(stepNo);
              
              return (
                <div key={step.code} className="dv-ledger-item" data-status={status}>
                  <span className="dv-ledger-rule" />
                  <span className="dv-ledger-code dv-mono">{step.code}</span>
                  <p className="text-[12.5px] font-semibold text-foreground leading-none mb-1">{step.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-normal">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
};
