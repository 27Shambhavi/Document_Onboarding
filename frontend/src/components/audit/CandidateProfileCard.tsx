import React from 'react';

interface CandidateProfileCardProps {
  extractedData: Record<string, any> | null | undefined;
  candidateName?: string | null;
  confidenceScore?: number | null;
  rawOcrText?: string | null;
  isDark?: boolean;
}

export const CandidateProfileCard: React.FC<CandidateProfileCardProps> = ({
  extractedData,
  rawOcrText,
  isDark = false,
}) => {
  if (!extractedData || Object.keys(extractedData).length === 0) {
    return (
      <div className={`p-8 rounded-2xl border text-center ${
        isDark ? 'bg-slate-900/60 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500 shadow-sm'
      }`}>
        <p className="text-sm font-semibold">No structured fields extracted yet.</p>
        <p className="text-xs text-slate-400 mt-1">Upload a candidate document to inspect extracted document profiles.</p>
      </div>
    );
  }

  // Determine if extractedData is nested by Document Type
  // e.g. { "Aadhaar Card": { "Full Name": "...", "DOB": "..." }, "PAN Card": { "PAN Number": "..." } }
  const isNestedStructure = Object.values(extractedData).some(
    (val) => typeof val === 'object' && val !== null && !Array.isArray(val)
  );

  // Normalize into sections: Array of [DocumentName, Record<string, any>]
  let documentSections: Array<{ documentName: string; fields: Record<string, any> }> = [];

  if (isNestedStructure) {
    Object.entries(extractedData).forEach(([docKey, content]) => {
      if (typeof content === 'object' && content !== null && !Array.isArray(content)) {
        // Filter out internal metadata keys
        const filteredFields: Record<string, any> = {};
        Object.entries(content).forEach(([fKey, fVal]) => {
          if (
            !fKey.startsWith('_') &&
            fKey !== 'doc_quality' &&
            fKey !== 'doc_quality_issues' &&
            fKey !== 'is_signed' &&
            fKey !== 'signatory_type' &&
            fKey !== 'signer_name' &&
            fKey !== 'signature_location' &&
            fKey !== 'signature_confidence'
          ) {
            filteredFields[fKey] = fVal;
          }
        });
        if (Object.keys(filteredFields).length > 0) {
          documentSections.push({
            documentName: docKey,
            fields: filteredFields,
          });
        }
      } else if (content !== null && typeof content !== 'object') {
        // Stray top-level key: group under General / Miscellaneous
        const miscSection = documentSections.find((s) => s.documentName === 'General Information');
        if (miscSection) {
          miscSection.fields[docKey] = content;
        } else {
          documentSections.push({
            documentName: 'General Information',
            fields: { [docKey]: content },
          });
        }
      }
    });
  } else {
    // Legacy flat data fallback
    const flatFields: Record<string, any> = {};
    Object.entries(extractedData).forEach(([k, v]) => {
      if (
        typeof v !== 'object' &&
        !k.startsWith('_') &&
        k !== 'raw_ocr_text' &&
        k !== 'ocr_text' &&
        k !== 'candidate_file' &&
        k !== 'requestId' &&
        k !== 'customer_id' &&
        k !== 'total_documents_detected' &&
        k !== 'doc_quality' &&
        k !== 'doc_quality_issues' &&
        k !== 'is_signed' &&
        k !== 'signatory_type' &&
        k !== 'signer_name'
      ) {
        flatFields[k] = v;
      }
    });
    if (Object.keys(flatFields).length > 0) {
      documentSections.push({
        documentName: 'Extracted Document',
        fields: flatFields,
      });
    }
  }

  if (documentSections.length === 0) {
    return (
      <div className={`p-8 rounded-2xl border text-center ${
        isDark ? 'bg-slate-900/60 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500 shadow-sm'
      }`}>
        <p className="text-sm font-semibold">Document processed successfully.</p>
        <p className="text-xs text-slate-400 mt-1">Raw document text available below.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {documentSections.map((section, sIdx) => (
        <div key={section.documentName || sIdx} className="w-full">
          {/* PROMINENT DOCUMENT SECTION HEADER */}
          <h3 className={`text-lg font-bold border-b pb-2 mb-4 ${
            sIdx === 0 ? 'mt-2' : 'mt-8'
          } ${
            isDark ? 'text-slate-100 border-slate-800' : 'text-slate-800 border-slate-200'
          }`}>
            {section.documentName}
          </h3>

          {/* GRID OF KEY-VALUE PAIRS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(section.fields).map(([fieldKey, val]) => (
              <div
                key={fieldKey}
                className={`p-4 rounded-xl border transition-all ${
                  isDark
                    ? 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                    : 'bg-white border-slate-200 shadow-sm hover:border-slate-300'
                }`}
              >
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                  {fieldKey.replace(/_/g, ' ')}
                </span>
                <p className={`text-sm font-bold truncate ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}>
                  {typeof val === 'boolean'
                    ? (val ? '✅ Verified / True' : '❌ False')
                    : val === null || val === undefined || String(val).trim() === ''
                    ? '—'
                    : String(val)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* RAW OCR STREAM OPTIONAL PREVIEW */}
      {Boolean(rawOcrText) && (
        <div className="pt-6 border-t border-slate-200/10">
          <h4 className={`text-xs font-bold uppercase tracking-wider mb-2 ${
            isDark ? 'text-slate-400' : 'text-slate-500'
          }`}>
            Document Text Stream:
          </h4>
          <div className={`p-4 rounded-xl text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto ${
            isDark ? 'bg-slate-950 border border-slate-800 text-slate-300' : 'bg-slate-50 border border-slate-200 text-slate-800'
          }`}>
            {rawOcrText}
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidateProfileCard;
