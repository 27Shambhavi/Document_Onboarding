import React from 'react';

interface CandidateProfileCardProps {
  extractedData: Record<string, any> | null | undefined;
  candidateName?: string | null;
  confidenceScore?: number | null;
  rawOcrText?: string | null;
  isDark?: boolean;
}

const FIELD_LABEL_MAP: Record<string, string> = {
  aadhar_number: 'Aadhaar Number',
  aadhar_name: 'Name on Aadhaar',
  aadhar_dob: 'Date of Birth (Aadhaar)',
  aadhar_address: 'Permanent Address (Aadhaar)',
  aadhar_father_name: "Father's Name (Aadhaar)",
  pan_number: 'PAN Number',
  pan_name: 'Name on PAN',
  pan_dob: 'Date of Birth (PAN)',
  pan_father_name: "Father's Name (PAN)",
  twelfth_name: 'Candidate Name (12th)',
  twelfth_yop: 'Year of Passing (12th)',
  twelfth_marks: 'Marks / % (12th)',
  tenth_name: 'Candidate Name (10th)',
  tenth_yop: 'Year of Passing (10th)',
  tenth_marks: 'Marks / % (10th)',
  grad_name: 'Candidate Name (Graduation)',
  grad_yop: 'Year of Passing (Graduation)',
  grad_marks: 'Marks / CGPA (Graduation)',
  employee_name: 'Employee Name',
  net_pay: 'Net Salary',
  salary_month: 'Salary Month',
  bank_name: 'Bank Name',
  account_number: 'Bank Account Number',
  bank_account_number: 'Bank Account Number',
  ifsc_code: 'IFSC Code',
  bank_ifsc_code: 'IFSC Code',
  branch_name: 'Branch Name',
  work_location: 'Work Location',
  department: 'Department',
  resume_name: 'Candidate Name (Resume)',
  resume_email: 'Email Address',
  resume_mobile_no: 'Mobile Number',
  resume_current_address: 'Current Address',
  resume_father_name: "Father's Name",
  'Face detected(Y/N)': 'Face Detected',
  is_signed: 'Signature Detected',
  signatory_type: 'Signatory Type',
  signer_name: 'Signer Name',
  doc_quality: 'Document Quality',
  doc_quality_issues: 'Quality Notes',
  'Board Name': 'Board Name',
  'School Name': 'School Name',
  'University/College Name': 'University / College',
  'Degree Name': 'Degree Name',
};

const formatFieldLabel = (key: string): string => {
  if (FIELD_LABEL_MAP[key]) return FIELD_LABEL_MAP[key];
  if (FIELD_LABEL_MAP[key.toLowerCase()]) return FIELD_LABEL_MAP[key.toLowerCase()];
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

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

    // If we have recognized named documents (e.g. Aadhar, PAN, Marksheet), filter out empty generic "Document_Page_N" sections
    const hasNamedDocs = documentSections.some(
      (s) => !s.documentName.startsWith('Document_Page_') && !s.documentName.startsWith('Page_')
    );
    if (hasNamedDocs) {
      documentSections = documentSections.filter(
        (s) => !s.documentName.startsWith('Document_Page_') || Object.keys(s.fields).length > 0
      );
    }
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
          <div className="flex items-center gap-2 border-b pb-2 mb-4">
            <h3 className={`text-base font-bold ${
              isDark ? 'text-slate-100' : 'text-slate-800'
            }`}>
              {section.documentName.replace(/_/g, ' ')}
            </h3>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
              isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
            }`}>
              {Object.keys(section.fields).length} {Object.keys(section.fields).length === 1 ? 'field' : 'fields'}
            </span>
          </div>

          {/* GRID OF KEY-VALUE PAIRS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {Object.entries(section.fields).map(([fieldKey, val]) => (
              <div
                key={fieldKey}
                className={`p-3.5 rounded-xl border transition-all ${
                  isDark
                    ? 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                    : 'bg-white border-slate-200 shadow-sm hover:border-slate-300'
                }`}
              >
                <span className="text-[11px] font-bold text-slate-400 tracking-wider block mb-1">
                  {formatFieldLabel(fieldKey)}
                </span>
                <p className={`text-sm font-semibold break-words leading-relaxed ${
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
