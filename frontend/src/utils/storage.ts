export interface StoredDocument {
  id: string;
  filename: string;
  requestId: string;
  companyId: string;
  label: string;
  status:
    | 'PENDING'
    | 'PROCESSING'
    | 'PROCESSED'
    | 'QUALITY_FAILED'
    | 'REJECTED'
    | 'UNKNOWN'
    | 'ACTION_REQUIRED';
  pages: number;
  uploadedAt: string;
  qualityStatus: 'PASSED' | 'FAILED' | 'PENDING';
  qualityReason?: string;

  // Stage 1 result only.
  extractedData: Record<string, any>;

  // Stage 2 result only.
  clearedGuidelines: string[];
  unclearedGuidelines: string[];

  // Original Stage 1 document JSON. Never merge Stage 2 into this object.
  rawJson: any;
}

const STORAGE_KEY = 'doc_onboarding_history';

export interface GuidelineVerdict {
  id: string;
  cleared_guidelines?: string[];
  uncleared_guidelines?: string[];
  [key: string]: any;
}

export interface Stage2VerificationResponse {
  status?: string;
  company_id?: string;
  total_guidelines_evaluated?: number;
  verified_candidates?: Array<{
    candidate_file?: string;
    requestId?: string;
    customer_id?: string;
    total_documents_detected?: number;
    guideline?: GuidelineVerdict[];
    [key: string]: any;
  }>;
  [key: string]: any;
}

export const storageUtil = {
  getDocuments: (): StoredDocument[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];

      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];

      return parsed;
    } catch (e) {
      console.error('Failed to parse document history', e);
      return [];
    }
  },

  saveDocuments: (docs: StoredDocument[]) => {
    try {
      const existing = storageUtil.getDocuments();
      const mergedMap = new Map<string, StoredDocument>();

      existing.forEach((doc) => mergedMap.set(doc.id, doc));
      docs.forEach((doc) => mergedMap.set(doc.id, doc));

      const updated = Array.from(mergedMap.values());

      updated.sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() -
          new Date(a.uploadedAt).getTime()
      );

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    } catch (e) {
      console.error('Failed to save documents to history', e);
      return [];
    }
  },

  saveSingleDocument: (doc: StoredDocument) => {
    return storageUtil.saveDocuments([doc]);
  },

  getDocumentById: (id: string): StoredDocument | null => {
    const docs = storageUtil.getDocuments();
    return docs.find((doc) => doc.id === id) || null;
  },

  deleteDocument: (id: string) => {
    try {
      const docs = storageUtil.getDocuments();
      const filtered = docs.filter((doc) => doc.id !== id);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      return filtered;
    } catch (e) {
      console.error('Failed to delete document', e);
      return storageUtil.getDocuments();
    }
  },

  clearStorage: () => {
    localStorage.removeItem(STORAGE_KEY);
  },

  // Build Stage-2 input from Stage-1 stored OCR data.
  // Stage-2 receives OCR as INPUT, but its RESULT remains separate.
  buildStage2Payload: (): any[] => {
    const documents = storageUtil.getDocuments();
    if (documents.length === 0) return [];

    const groupedCandidates = new Map<
      string,
      {
        candidate_file: string;
        requestId: string;
        customer_id: string;
        files: any[];
      }
    >();

    documents.forEach((doc) => {
      const requestId = doc.requestId || 'REQ-UNKNOWN';

      if (!groupedCandidates.has(requestId)) {
        groupedCandidates.set(requestId, {
          candidate_file: doc.filename || 'candidate-document',
          requestId,
          customer_id: doc.companyId || 'DEFAULT_COMPANY',
          files: [],
        });
      }

      const candidate = groupedCandidates.get(requestId)!;

      candidate.files.push({
        id: doc.id,
        label: doc.label,
        url: doc.rawJson?.url ?? null,
        ocr_data: doc.extractedData || {},
      });
    });

    return Array.from(groupedCandidates.values());
  },

  // Apply ONLY Stage-2 guideline verdicts.
  // IMPORTANT: rawJson and extractedData are NOT overwritten by Stage-2.
  applyGuidelineVerificationResults: (
    verificationResponse: Stage2VerificationResponse
  ): StoredDocument[] => {
    try {
      const existingDocuments = storageUtil.getDocuments();

      if (!verificationResponse?.verified_candidates) {
        console.warn(
          'Stage-2 response does not contain verified_candidates.'
        );
        return existingDocuments;
      }

      const verdictMap = new Map<string, GuidelineVerdict>();

      verificationResponse.verified_candidates.forEach((candidate) => {
        const verdicts = candidate.guideline || [];

        verdicts.forEach((verdict) => {
          if (verdict?.id) {
            verdictMap.set(verdict.id, verdict);
          }
        });
      });

      const updatedDocuments = existingDocuments.map((doc) => {
        const verdict = verdictMap.get(doc.id);

        // No Stage-2 verdict for this document: keep Stage-1 exactly as-is.
        if (!verdict) {
          return doc;
        }

        const clearedGuidelines = Array.isArray(
          verdict.cleared_guidelines
        )
          ? verdict.cleared_guidelines
          : [];

        const unclearedGuidelines = Array.isArray(
          verdict.uncleared_guidelines
        )
          ? verdict.uncleared_guidelines
          : [];

        const hasUnclearedGuidelines =
          unclearedGuidelines.length > 0;

        let updatedStatus = doc.status;

        if (doc.qualityStatus === 'FAILED') {
          updatedStatus = 'QUALITY_FAILED';
        } else if (hasUnclearedGuidelines) {
          updatedStatus = 'ACTION_REQUIRED';
        } else if (clearedGuidelines.length > 0) {
          updatedStatus = 'PROCESSED';
        }

        return {
          ...doc,

          // Stage 1 remains untouched.
          extractedData: doc.extractedData,
          rawJson: doc.rawJson,

          // Stage 2 lives ONLY here.
          status: updatedStatus,
          clearedGuidelines,
          unclearedGuidelines,
        };
      });

      storageUtil.saveDocuments(updatedDocuments);
      return updatedDocuments;
    } catch (e) {
      console.error(
        'Failed to apply guideline verification results',
        e
      );
      return storageUtil.getDocuments();
    }
  },

  getGuidelineStatus: (
    doc: StoredDocument
  ): 'CLEARED' | 'UNCLEARED' | 'NOT_VERIFIED' => {
    if (doc.unclearedGuidelines?.length > 0) {
      return 'UNCLEARED';
    }

    if (doc.clearedGuidelines?.length > 0) {
      return 'CLEARED';
    }

    return 'NOT_VERIFIED';
  },

  hasGuidelineResults: (doc: StoredDocument): boolean => {
    return (
      (doc.clearedGuidelines?.length ?? 0) > 0 ||
      (doc.unclearedGuidelines?.length ?? 0) > 0
    );
  },
};

export const getLabelFromId = (
  id: string,
  defaultLabel?: string
): string => {
  const parts = id.split('-');

  if (parts.length >= 2) {
    const prefix = parts[1];

    switch (prefix) {
      case 'RES':
        return 'Resume';
      case 'ADH':
        return 'Aadhar';
      case 'PAN':
        return 'PAN';
      case 'MKS':
        return 'Mark sheet';
      case 'EXP':
        return 'Previous Company Experience letter';
      case 'PHT':
        return 'Employee Photo';
      case 'PAY':
        return 'Previous Company payslip';
      case 'CBL':
        return 'Cibil Consent/Authorization form';
      case 'FRM':
        return 'Application for Employment';
      default:
        break;
    }
  }

  if (defaultLabel && defaultLabel !== 'Document') {
    return defaultLabel;
  }

  return 'Document';
};

export const formatGuidelineRule = (rule: string): string => {
  if (!rule) return '';

  if (/^[a-z0-9_]+$/.test(rule)) {
    return rule
      .split('_')
      .map(
        (word) =>
          word.charAt(0).toUpperCase() +
          word.slice(1)
      )
      .join(' ');
  }

  return rule;
};
