import { apiClient } from './client';
import type {
  Stage1OCRResponse,
  Stage2VerificationResponse,
  AuditCandidateFolderResponse,
} from '../types';

export const documentsApi = {
  /*
   * ONE-PASS DOCUMENT OCR
   *
   * Supports:
   * 1. File only
   * 2. File + URL
   * 3. URL only
   */
  processDocumentOcr: async (
    file?: File,
    enableSignatureDetection: boolean = false,
    url?: string
  ): Promise<any> => {
    if (!file && !url) {
      throw new Error('Either a document file or URL is required.');
    }

    const formData = new FormData();

    if (file) {
      formData.append('file', file);
    }

    if (url?.trim()) {
      formData.append('url', url.trim());
    }

    const response = await apiClient.post<any>(
      '/documents/process',
      formData,
      {
        params: {
          enable_signature_detection: enableSignatureDetection,
        },
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data;
  },

  /*
   * TWO-STAGE STAGE 1 OCR
   *
   * Supports:
   * 1. File only
   * 2. File + URL
   * 3. URL only
   */
  stage1ExtractOcr: async (
    file?: File,
    url?: string
  ): Promise<Stage1OCRResponse> => {
    if (!file && !url) {
      throw new Error('Either a document file or URL is required.');
    }

    const formData = new FormData();

    if (file) {
      formData.append('file', file);
    }

    if (url?.trim()) {
      formData.append('url', url.trim());
    }

    const response = await apiClient.post<Stage1OCRResponse>(
      '/documents/stage1-extract-ocr',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data;
  },

  /*
   * TWO-STAGE STAGE 2 GUIDELINE VERIFICATION
   */
  stage2VerifyGuidelines: async (
    payload: any
  ): Promise<Stage2VerificationResponse> => {
    const response =
      await apiClient.post<Stage2VerificationResponse>(
        '/documents/stage2-verify-guidelines',
        payload
      );

    return response.data;
  },

  /*
   * ONE-CLICK CANDIDATE FOLDER AUDIT
   *
   * Existing file-based functionality preserved.
   */
  auditCandidateFolder: async (
    file: File
  ): Promise<AuditCandidateFolderResponse> => {
    const formData = new FormData();

    formData.append('file', file);

    const response =
      await apiClient.post<AuditCandidateFolderResponse>(
        '/documents/audit-candidate-folder',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

    return response.data;
  },
};