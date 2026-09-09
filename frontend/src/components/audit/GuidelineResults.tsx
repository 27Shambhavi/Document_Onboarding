import React from 'react';
import { CheckCircle2, XCircle, FileCheck, ShieldCheck, AlertCircle } from 'lucide-react';

export interface RuleVerdict {
  rule_id?: string;
  rule_title?: string;
  document_label?: string;
  document_id?: string;
  status?: string;
  matched?: boolean;
  evidence?: string;
  reasoning?: string;
  recommendation?: string;
}

interface GuidelineResultsProps {
  rules: RuleVerdict[];
  isDark?: boolean;
}

// Helper to format field identifiers into readable English (e.g. bankName -> Bank Name)
const formatFieldName = (rawName: string): string => {
  if (!rawName) return 'Field Verification';
  // Insert space before camelCase capitals: bankName -> bank Name
  const camelSpaced = rawName.replace(/([a-z])([A-Z])/g, '$1 $2');
  // Replace underscores and hyphens
  const words = camelSpaced.replace(/[_-]/g, ' ').trim().split(/\s+/);
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

// Helper to deduce document context from rule properties or prefixes
const resolveDocumentContext = (rule: RuleVerdict): { docContext: string; fieldName: string; cleanReasoning: string } => {
  const fullText = rule.rule_title || rule.reasoning || '';
  
  // 1. Check if formatted in breadcrumb syntax: "DocType -> FieldName -> Reasoning"
  if (fullText.includes('->')) {
    const parts = fullText.split('->').map((p) => p.trim());
    if (parts.length >= 3) {
      return {
        docContext: parts[0] || rule.document_label || 'Required Document',
        fieldName: formatFieldName(parts[1]),
        cleanReasoning: parts.slice(2).join(' -> '),
      };
    }
    if (parts.length === 2) {
      return {
        docContext: parts[0] || rule.document_label || 'Required Document',
        fieldName: formatFieldName(parts[1]),
        cleanReasoning: rule.reasoning || `${parts[0]} verification details.`,
      };
    }
  }

  // 2. Check if rule has explicit document_label
  if (rule.document_label) {
    return {
      docContext: rule.document_label,
      fieldName: formatFieldName(rule.rule_title || 'Document Compliance'),
      cleanReasoning: rule.reasoning || `Evaluated against ${rule.document_label} policy rules.`,
    };
  }

  // 3. Fallback: Parse common document tags from document_id (e.g., DOC-ADH-01, DOC-PAN-02)
  const docId = (rule.document_id || '').toUpperCase();
  let deducedDoc = 'Required Document';
  if (docId.includes('ADH') || docId.includes('AADHAAR')) deducedDoc = 'Aadhaar Card';
  else if (docId.includes('PAN')) deducedDoc = 'PAN Card';
  else if (docId.includes('RES') || docId.includes('CV')) deducedDoc = 'Resume / Curriculum Vitae';
  else if (docId.includes('BNK') || docId.includes('BANK')) deducedDoc = 'Bank Passbook / Statement';
  else if (docId.includes('EXP')) deducedDoc = 'Experience Letter';
  else if (docId.includes('MKS') || docId.includes('10TH') || docId.includes('12TH')) deducedDoc = 'Academic Mark Sheet';
  else if (docId.includes('PHT') || docId.includes('PHOTO')) deducedDoc = 'Employee Photograph';

  return {
    docContext: deducedDoc,
    fieldName: formatFieldName(rule.rule_title || 'Compliance Rule'),
    cleanReasoning: rule.reasoning || 'Evaluated against company compliance checklist.',
  };
};

export const GuidelineResults: React.FC<GuidelineResultsProps> = ({ rules, isDark = false }) => {
  if (!rules || rules.length === 0) {
    return (
      <div className={`p-8 rounded-2xl border text-center ${
        isDark ? 'bg-slate-900/60 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500 shadow-sm'
      }`}>
        <ShieldCheck className="w-8 h-8 mx-auto text-slate-400 mb-2" />
        <p className="text-sm font-semibold">No guidelines evaluated yet.</p>
        <p className="text-xs text-slate-400 mt-1">Execute a document audit to view compliance verdicts and verification reasoning.</p>
      </div>
    );
  }

  // Group rules by target document type
  const groupedRules = React.useMemo(() => {
    const map: Record<string, RuleVerdict[]> = {};
    rules.forEach((rule) => {
      const { docContext } = resolveDocumentContext(rule);
      const groupName = docContext || 'General Compliance Rules';
      if (!map[groupName]) {
        map[groupName] = [];
      }
      map[groupName].push(rule);
    });
    return map;
  }, [rules]);

  const documentGroups = Object.entries(groupedRules);

  return (
    <div className="space-y-8 w-full max-w-full">
      {documentGroups.map(([docName, docRules], groupIdx) => {
        const docClearedCount = docRules.filter(
          (r) => r?.status === 'CLEARED' || r?.matched === true
        ).length;
        const docUnclearedCount = docRules.length - docClearedCount;
        const allDocCleared = docUnclearedCount === 0;

        return (
          <div key={docName || groupIdx} className="w-full">
            {/* DOCUMENT SUB-HEADING (1-to-1 visual consistency with CandidateProfileCard) */}
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between border-b pb-2 mb-4 gap-2 ${
              groupIdx === 0 ? 'mt-2' : 'mt-8'
            } ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}>
              <h3 className={`text-lg font-bold flex items-center gap-2.5 ${
                isDark ? 'text-slate-100' : 'text-slate-800'
              }`}>
                <FileCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                <span>{docName}</span>
              </h3>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                  isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
                }`}>
                  {docRules.length} {docRules.length === 1 ? 'Rule' : 'Rules'} Evaluated
                </span>

                {allDocCleared ? (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 whitespace-nowrap">
                    ✅ All Cleared
                  </span>
                ) : (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 whitespace-nowrap">
                    ⚠️ {docUnclearedCount} Action Required
                  </span>
                )}
              </div>
            </div>

            {/* RULES EVALUATED FOR THIS DOCUMENT */}
            <div className="grid grid-cols-1 gap-3.5">
              {docRules.map((rule, rIdx) => {
                const isCleared = rule?.status === 'CLEARED' || rule?.matched === true;
                const { fieldName, cleanReasoning } = resolveDocumentContext(rule);

                // Build explicit AI reasoning with clear document context
                const explicitReasoning = cleanReasoning.toLowerCase().includes(docName.toLowerCase())
                  ? cleanReasoning
                  : isCleared
                  ? `Verified condition for ${fieldName} on document "${docName}".`
                  : `Document "${docName}" failed compliance: required field "${fieldName}" was missing or unverified.`;

                return (
                  <div
                    key={rule?.rule_id || `${groupIdx}-${rIdx}`}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                      isCleared
                        ? isDark
                          ? 'bg-slate-900/80 border-emerald-500/30 shadow-sm'
                          : 'bg-white border-emerald-200 shadow-sm'
                        : isDark
                        ? 'bg-slate-900/80 border-rose-500/40 shadow-sm'
                        : 'bg-white border-rose-200 shadow-sm'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                      <div className="flex items-center space-x-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                            isCleared
                              ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-500 border border-rose-500/30'
                          }`}
                        >
                          {isCleared ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </div>

                        {/* BREADCRUMB UI HEADER: Document Name -> Field Name */}
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1 ${
                            isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}>
                            <span>{docName}</span>
                            <span className="text-slate-400 font-bold">&rarr;</span>
                          </span>
                          <span className={`font-bold text-sm sm:text-base truncate ${
                            isDark ? 'text-slate-100' : 'text-slate-900'
                          }`}>
                            {fieldName}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase self-start sm:self-auto whitespace-nowrap flex-shrink-0 border ${
                          isCleared
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {isCleared ? 'CLEARED' : 'UNCLEARED'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs pl-0 sm:pl-11">
                      {rule?.evidence && (
                        <div className={`p-3 rounded-xl border ${
                          isDark ? 'bg-slate-950/60 border-slate-800 text-indigo-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}>
                          <span className="font-bold block mb-0.5 text-slate-400 uppercase text-[10px] tracking-wider">
                            Match Evidence:
                          </span>
                          <p className="font-mono text-indigo-600 dark:text-indigo-400 break-words">{String(rule.evidence)}</p>
                        </div>
                      )}

                      {/* CONTEXTUAL AI REASONING SPECIFYING EXACT DOCUMENT */}
                      <div className="pt-1">
                        <span className={`font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          AI Reasoning:
                        </span>{' '}
                        <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                          {explicitReasoning}
                        </span>
                      </div>

                      {/* RECOMMENDATION IF UNCLEARED */}
                      {!isCleared && (
                        <div className="pt-1.5 flex items-start gap-1.5 text-rose-600 dark:text-rose-400 font-medium">
                          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <div>
                            <strong>Recommendation:</strong>{' '}
                            {rule?.recommendation || `Please upload a complete, high-resolution copy of ${docName} containing verified ${fieldName}.`}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default GuidelineResults;
