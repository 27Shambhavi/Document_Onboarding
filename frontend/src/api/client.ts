import axios from 'axios';

// Default to running backend port 8567 or 8000
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8567';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Interceptor for Client JWT and Admin JWT Tokens
apiClient.interceptors.request.use((config) => {
  const adminToken = localStorage.getItem('docverify_admin_token');
  const clientToken = localStorage.getItem('docverify_token');
  const token = adminToken || clientToken;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface UserSession {
  company_id: string;
  company_name: string;
  email: string;
  access_token: string;
  role?: string;
}

export interface AdminCompany {
  company_id: string;
  company_name: string;
  email: string;
  status: 'ACTIVE' | 'PENDING' | 'REJECTED';
  is_active: boolean;
  created_at: string;
  approved_at?: string;
  approved_by?: string;
}

export interface BlueprintSchema {
  document_type: string;
  required_fields: string[];
  extraction_rules: Record<string, string>;
  validation_strictness: 'standard' | 'high' | 'strict';
}

export interface GuidelineRule {
  id: string;
  category: string;
  rule_title: string;
  description: string;
  condition: string;
  mandatory: boolean;
}

export interface CandidateContext {
  candidate_name: string;
  candidate_id?: string;
  department?: string;
}

export interface OCRExtractionResult {
  candidate_name?: string;
  document_type?: string;
  confidence_score?: number;
  extracted_fields?: Record<string, any>;
  raw_ocr_text?: string;
  processed_at?: string;
  candidates_ocr_data?: Array<Record<string, any>>;
  status?: string;
  message?: string;
}

export interface VerificationRuleResult {
  rule_id: string;
  rule_title: string;
  status: 'CLEARED' | 'UNCLEARED';
  matched: boolean;
  score: number;
  evidence: string;
  explanation: string;
  recommendation?: string;
}

export interface AuditReport {
  // Standard audit report fields
  candidate_name?: string;
  candidate_id?: string;
  overall_status?: 'CLEARED' | 'UNCLEARED' | string;
  total_rules?: number;
  cleared_count?: number;
  uncleared_count?: number;
  pass_percentage?: number;
  audit_timestamp?: string;
  ocr_summary?: {
    document_type?: string;
    confidence_score?: number;
    extracted_fields?: Record<string, any>;
  };
  rule_results?: VerificationRuleResult[];
  results?: Array<Record<string, any>>;
  raw_json_response?: Record<string, any>;

  // Task 4: Unified /audit/1-click response fields (side-by-side rendering)
  status?: string;
  company_id?: string;
  total_candidates_processed?: number;
  total_guidelines_evaluated?: number;
  candidates_ocr_data?: Array<Record<string, any>>;
  verified_candidates?: Array<Record<string, any>>;
  guideline?: Array<any>;
  failures?: Array<{ error: string }>;
}

export interface BillingMetrics {
  total_pages_scanned: number;
  price_per_page: number;
  price_per_signature: number;
  signature_addon_enabled: boolean;
  signature_unlocked: boolean;
  total_signature_checks: number;
  estimated_bill_usd: number;
  billing_period: string;
  company_id: string;
  company_name: string;
}

export interface DocumentScan {
  id: number;
  company_id: string;
  filename: string;
  pages_count: number;
  cost_inr: number;
  created_at: string;
  extracted_json?: Record<string, any>;
}

// ==========================================
// REAL BACKEND API IMPLEMENTATION (NO MOCKS)
// ==========================================

export const api = {
  // 0. AUTHENTICATION ENDPOINTS
  loginCompany: async (email: string, password: string): Promise<UserSession> => {
    const res = await apiClient.post('/company/login', { email, password });
    return res.data;
  },

  onboardCompany: async (data: { company_id: string; company_name: string; email: string; password: string; invite_token: string }): Promise<UserSession> => {
    const res = await apiClient.post('/company/onboard', data);
    return res.data;
  },

  loginAdmin: async (email: string, password: string) => {
    const res = await apiClient.post('/admin/login', { email, password });
    return res.data;
  },

  // 1. ADMIN ENDPOINTS
  generateInviteToken: async () => {
    const res = await apiClient.post('/admin/tokens/generate');
    return res.data;
  },

  getAdminCompanies: async (): Promise<{ total: number; companies: AdminCompany[] }> => {
    const res = await apiClient.get('/admin/companies');
    return res.data;
  },

  approveCompany: async (companyId: string) => {
    const res = await apiClient.post(`/admin/companies/${companyId}/approve`);
    return res.data;
  },

  rejectCompany: async (companyId: string) => {
    const res = await apiClient.post(`/admin/companies/${companyId}/reject`);
    return res.data;
  },

  // 2. CONFIG HUB ENDPOINTS
  getBlueprint: async () => {
    const res = await apiClient.get('/company/blueprint');
    return res.data;
  },

  registerBlueprintJson: async (blueprintData: any) => {
    const res = await apiClient.post('/company/register-blueprint-json', blueprintData);
    return res.data;
  },

  registerBlueprintDoc: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post('/company/register-blueprint-doc', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  saveGuidelines: async (content: { text?: string; json_rules?: any }, file?: File) => {
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      // FIXED: Pointing file uploads to the correct endpoint
      const res = await apiClient.post('/company/guidelines/upload-policy', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    } else {
      // JSON data goes to the standard endpoint
      const res = await apiClient.post('/company/guidelines', content);
      return res.data;
    }
  },

  getGuidelines: async () => {
    const res = await apiClient.get('/company/guidelines');
    return res.data;
  },

  // 3. AUDIT & EXECUTION PIPELINE ENDPOINTS
  stage1ExtractOCR: async (file?: File, url?: string, candidateName?: string): Promise<OCRExtractionResult> => {
    const formData = new FormData();
    if (candidateName && candidateName.trim()) {
      formData.append('candidate_name', candidateName.trim());
    }
    if (file) {
      formData.append('file', file);
    }
    if (url && url.trim()) {
      formData.append('url', url.trim());
    }

    const res = await apiClient.post('/documents/stage1-extract-ocr', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  stage2VerifyGuidelines: async (ocrData: any): Promise<AuditReport> => {
    const payload = Array.isArray(ocrData) ? ocrData : [ocrData];
    const res = await apiClient.post('/documents/stage2-verify-guidelines', payload);
    return res.data;
  },

  runOneClickAudit: async (file?: File, url?: string): Promise<AuditReport> => {
    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    }
    if (url && url.trim()) {
      formData.append('url', url.trim());
    }

    // Task 4: Unified /audit/1-click endpoint
    const res = await apiClient.post('/audit/1-click', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  // 4. BILLING & ANALYTICS ENDPOINTS
  getBillingSummary: async (period = 'monthly'): Promise<BillingMetrics> => {
    const res = await apiClient.get(`/client/usage/summary?period=${period}`);
    return res.data;
  },

  getAdminOverview: async (period = 'monthly') => {
    const res = await apiClient.get(`/admin/analytics/overview?period=${period}`);
    return res.data;
  },

  updateBillingPricing: async (pricePerPage: number, pricePerSignature: number) => {
    const res = await apiClient.put('/admin/billing/pricing', {
      price_per_page: pricePerPage,
      price_per_signature_check: pricePerSignature,
    });
    return res.data;
  },

  toggleSignatureAddon: async (companyId: string, enabled: boolean) => {
    const res = await apiClient.patch(`/admin/companies/${companyId}/signature-addon`, {
      is_signature_addon_enabled: enabled,
    });
    return res.data;
  },

  // 5. SCAN HISTORY ENDPOINTS — Task 1
  getCompanyScans: async (limit = 50, offset = 0): Promise<{
    status: string;
    company_id: string;
    total_scans: number;
    total_pages_scanned: number;
    total_cost_inr: number;
    scans: DocumentScan[];
  }> => {
    const res = await apiClient.get(`/company/scans?limit=${limit}&offset=${offset}`);
    return res.data;
  },

  getScanDetail: async (scanId: number): Promise<DocumentScan> => {
    const res = await apiClient.get(`/company/scans/${scanId}`);
    return res.data;
  },

  // 6. ADMIN UNLOCK SIGNATURE — Task 2
  unlockSignature: async (companyId: string, secretToken: string) => {
    const res = await apiClient.post(`/admin/unlock-signature/${companyId}`, {
      secret_token: secretToken,
    });
    return res.data;
  },
};
