import axios from 'axios';

// Default to running backend port 8567 or 8000
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:8567';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },

  // Increased from 30 seconds to 10 minutes.
  // Large ZIP/document audits can take several minutes
  // because every PDF page may require AI processing.
  timeout: 600000,
});


// ================================================================
// INTERCEPTOR FOR CLIENT JWT AND ADMIN JWT TOKENS
// ================================================================

apiClient.interceptors.request.use((config) => {
  const adminToken = localStorage.getItem(
    'docverify_admin_token'
  );

  const clientToken = localStorage.getItem(
    'docverify_token'
  );

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
  validation_strictness:
    | 'standard'
    | 'high'
    | 'strict';
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

  overall_status?:
    | 'CLEARED'
    | 'UNCLEARED'
    | string;

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

  // Task 4:
  // Unified /audit/1-click response fields
  // for side-by-side rendering

  status?: string;
  company_id?: string;

  total_candidates_processed?: number;
  total_guidelines_evaluated?: number;

  candidates_ocr_data?: Array<Record<string, any>>;

  verified_candidates?: Array<Record<string, any>>;

  guideline?: Array<any>;

  failures?: Array<{
    error: string;
  }>;
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
  has_guidelines?: boolean;
  guideline?: any[];
  grouped_guidelines?: Record<string, any>;
  rules_by_document?: Record<string, any>;
}


export interface Project {
  id: number;
  company_id: string;
  project_name: string;
  project_code: string;
  raw_project_spec: string;
  required_skills: string[];
  experience_requirements?: string;
  education_requirements?: string | string[];
  team_capacity: number;
  allocated_count: number;
  extracted_requirements: Record<string, any>;
  created_at: string;
  updated_at?: string;
  // Legacy aliases
  job_title?: string;
  raw_jd_text?: string;
}


export interface CandidateAllocation {
  id: number;
  candidate_id?: string | number;
  candidate_name: string;
  document_filename?: string;
  candidate_email?: string;
  match_score: number;
  status: 'ALLOCATED' | 'REJECTED' | 'ON_HOLD' | 'PENDING';
  allocated_at?: string;
  notes?: string;
}


export interface RankedCandidate {
  candidate_id: string | number;
  candidate_name: string;
  candidate_filename: string;
  candidate_email: string;
  score: number;
  rank: number;
  match_status: string;
  status: 'ALLOCATED' | 'REJECTED' | 'ON_HOLD' | 'PENDING';
  project_id?: number;
  allocated_at?: string | null;
  score_breakdown: {
    skills: number;
    experience: number;
    education: number;
    certifications: number;
  };
  matched_requirements: Array<{
    category: string;
    requirement: string;
    evidence: string;
  }>;
  missing_requirements: Array<{
    category: string;
    requirement: string;
    reason: string;
  }>;
  recommendation: string;
  extracted_skills: string[];
  uploaded_at?: string;
}


// ==========================================
// REAL BACKEND API IMPLEMENTATION
// NO MOCKS
// ==========================================

export const api = {

  // ============================================================
  // 0. AUTHENTICATION ENDPOINTS
  // ============================================================

  loginCompany: async (
    email: string,
    password: string
  ): Promise<UserSession> => {

    const res = await apiClient.post(
      '/company/login',
      {
        email,
        password,
      }
    );

    return res.data;
  },


  onboardCompany: async (
    data: {
      company_id: string;
      company_name: string;
      email: string;
      password: string;
      invite_token: string;
    }
  ): Promise<UserSession> => {

    const res = await apiClient.post(
      '/company/onboard',
      data
    );

    return res.data;
  },


  loginAdmin: async (
    email: string,
    password: string
  ) => {

    const res = await apiClient.post(
      '/admin/login',
      {
        email,
        password,
      }
    );

    return res.data;
  },


  // ============================================================
  // 1. ADMIN ENDPOINTS
  // ============================================================

  generateInviteToken: async () => {

    const res = await apiClient.post(
      '/admin/tokens/generate'
    );

    return res.data;
  },


  getAdminCompanies: async (): Promise<{
    total: number;
    companies: AdminCompany[];
  }> => {

    const res = await apiClient.get(
      '/admin/companies'
    );

    return res.data;
  },


  approveCompany: async (
    companyId: string
  ) => {

    const res = await apiClient.post(
      `/admin/companies/${companyId}/approve`
    );

    return res.data;
  },


  rejectCompany: async (
    companyId: string
  ) => {

    const res = await apiClient.post(
      `/admin/companies/${companyId}/reject`
    );

    return res.data;
  },


  // ============================================================
  // 2. CONFIG HUB ENDPOINTS
  // ============================================================

  getBlueprint: async () => {

    const res = await apiClient.get(
      '/company/blueprint'
    );

    return res.data;
  },


  registerBlueprintJson: async (
    blueprintData: any
  ) => {

    const res = await apiClient.post(
      '/company/register-blueprint-json',
      blueprintData
    );

    return res.data;
  },


  registerBlueprintDoc: async (
    file: File
  ) => {

    const formData = new FormData();

    formData.append(
      'file',
      file
    );

    const res = await apiClient.post(
      '/company/register-blueprint-doc',
      formData,
      {
        headers: {
          'Content-Type':
            'multipart/form-data',
        },
      }
    );

    return res.data;
  },


  saveGuidelines: async (
    content: {
      text?: string;
      json_rules?: any;
    },
    file?: File
  ) => {

    if (file) {

      const formData = new FormData();

      formData.append(
        'file',
        file
      );

      // FIXED:
      // Pointing file uploads to the correct endpoint

      const res = await apiClient.post(
        '/company/guidelines/upload-policy',
        formData,
        {
          headers: {
            'Content-Type':
              'multipart/form-data',
          },
        }
      );

      return res.data;

    } else {

      // JSON data goes to the standard endpoint

      const res = await apiClient.post(
        '/company/guidelines',
        content
      );

      return res.data;
    }
  },


  getGuidelines: async () => {

    const res = await apiClient.get(
      '/company/guidelines'
    );

    return res.data;
  },


  // ============================================================
  // 3. AUDIT & EXECUTION PIPELINE ENDPOINTS
  // ============================================================

  stage1ExtractOCR: async (
    file?: File,
    url?: string,
    candidateName?: string
  ): Promise<OCRExtractionResult> => {

    const formData = new FormData();

    if (
      candidateName &&
      candidateName.trim()
    ) {

      formData.append(
        'candidate_name',
        candidateName.trim()
      );
    }

    if (file) {

      formData.append(
        'file',
        file
      );
    }

    if (
      url &&
      url.trim()
    ) {

      formData.append(
        'url',
        url.trim()
      );
    }


    const res = await apiClient.post(
      '/documents/stage1-extract-ocr',
      formData,
      {
        headers: {
          'Content-Type':
            'multipart/form-data',
        },
      }
    );

    return res.data;
  },


  stage2VerifyGuidelines: async (
    ocrData: any
  ): Promise<AuditReport> => {

    const payload = Array.isArray(
      ocrData
    )
      ? ocrData
      : [ocrData];

    const res = await apiClient.post(
      '/documents/stage2-verify-guidelines',
      payload
    );

    return res.data;
  },


  // ============================================================
  // ONE CLICK AUDIT
  // ============================================================

  runOneClickAudit: async (
    file?: File,
    url?: string
  ): Promise<AuditReport> => {

    const formData = new FormData();

    if (file) {

      formData.append(
        'file',
        file
      );
    }

    if (
      url &&
      url.trim()
    ) {

      formData.append(
        'url',
        url.trim()
      );
    }


    // Task 4:
    // Unified /audit/1-click endpoint

    const res = await apiClient.post(
      '/audit/1-click',
      formData,
      {
        headers: {
          'Content-Type':
            'multipart/form-data',
        },

        // Explicitly keep a long timeout
        // for large ZIP candidate audits.

        timeout: 600000,
      }
    );

    return res.data;
  },


  // ============================================================
  // 4. BILLING & ANALYTICS ENDPOINTS
  // ============================================================

  getBillingSummary: async (
    period = 'monthly'
  ): Promise<BillingMetrics> => {

    const res = await apiClient.get(
      `/client/usage/summary?period=${period}`
    );

    return res.data;
  },


  getAdminOverview: async (
    period = 'monthly'
  ) => {

    const res = await apiClient.get(
      `/admin/analytics/overview?period=${period}`
    );

    return res.data;
  },


  updateBillingPricing: async (
    pricePerPage: number,
    pricePerSignature: number
  ) => {

    const res = await apiClient.put(
      '/admin/billing/pricing',
      {
        price_per_page:
          pricePerPage,

        price_per_signature_check:
          pricePerSignature,
      }
    );

    return res.data;
  },


  toggleSignatureAddon: async (
    companyId: string,
    enabled: boolean
  ) => {

    const res = await apiClient.patch(
      `/admin/companies/${companyId}/signature-addon`,
      {
        is_signature_addon_enabled:
          enabled,
      }
    );

    return res.data;
  },


  // ============================================================
  // 5. SCAN HISTORY ENDPOINTS
  // ============================================================

  getCompanyScans: async (
    limit = 50,
    offset = 0
  ): Promise<{
    status: string;
    company_id: string;
    total_scans: number;
    total_pages_scanned: number;
    total_cost_inr: number;
    scans: DocumentScan[];
  }> => {

    const res = await apiClient.get(
      `/company/scans?limit=${limit}&offset=${offset}`
    );

    return res.data;
  },


  getScanDetail: async (
    scanId: number
  ): Promise<DocumentScan> => {

    const res = await apiClient.get(
      `/company/scans/${scanId}`
    );

    return res.data;
  },


  getScanFileBlob: async (
    scanId: number
  ): Promise<Blob> => {

    const res = await apiClient.get(
      `/company/scans/${scanId}/file`,
      {
        responseType: 'blob',
      }
    );

    return res.data;
  },

  getScanDocumentUrl: (
    scanId: number
  ): string => {
    const adminToken = localStorage.getItem('docverify_admin_token');
    const clientToken = localStorage.getItem('docverify_token');
    const token = adminToken || clientToken;
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${API_BASE_URL}/company/scans/${scanId}/document${tokenParam}`;
  },


  // ============================================================
  // 6. CLIENT UNLOCK SIGNATURE
  // Single-use company-specific token
  // ============================================================

  unlockSignature: async (
    token: string
  ): Promise<{
    status: string;
    company_id: string;
    signature_unlocked: boolean;
    message: string;
  }> => {

    const res = await apiClient.post(
      '/client/unlock-signature',
      {
        token,
      }
    );

    return res.data;
  },


  // ============================================================
  // 7. ADMIN GOVERNANCE & USAGE
  // ============================================================

  getBillingPricing: async (): Promise<{
    price_per_page: number;
    price_per_signature_check: number;
    currency: string;
    updated_at: string;
  }> => {

    const res = await apiClient.get(
      '/admin/billing/pricing'
    );

    return res.data;
  },


  getCompanyUsageAdmin: async (
    companyId: string
  ): Promise<{
    status: string;
    company_id: string;
    company_name: string;
    email: string;
    company_status: string;
    is_active: boolean;
    signature_unlocked: boolean;
    signature_unlock_token?:
      | string
      | null;

    total_scans: number;
    total_pages: number;
    total_revenue_inr: number;

    recent_scans: Array<{
      id: number;
      filename: string;
      pages_count: number;
      cost_inr: number;
      created_at: string | null;
    }>;
  }> => {

    const res = await apiClient.get(
      `/admin/companies/${companyId}/usage`
    );

    return res.data;
  },


  generateCompanySignatureToken: async (
    companyId: string
  ): Promise<{
    status: string;
    company_id: string;
    signature_unlock_token: string;
    signature_unlocked: boolean;
    message: string;
  }> => {

    const res = await apiClient.post(
      `/admin/companies/${companyId}/generate-signature-token`
    );

    return res.data;
  },


  // ============================================================
  // 8. ENTERPRISE PROJECT ALLOTMENT & CANDIDATE MATCHING
  // ============================================================

  createProject: async (
    payload:
      | FormData
      | {
          project_name: string;
          project_code?: string;
          required_skills?: string[];
          experience_requirements?: string;
          education_requirements?: string;
          team_capacity?: number;
          raw_project_spec?: string;
          raw_text?: string;
          job_title?: string;
        }
  ): Promise<Project> => {
    let headers: Record<string, string> = {};
    if (payload instanceof FormData) {
      headers['Content-Type'] = 'multipart/form-data';
    }

    const res = await apiClient.post('/hr/projects', payload, { headers });
    return res.data;
  },

  getProjects: async (): Promise<{
    status: string;
    total: number;
    projects: Project[];
    job_descriptions: Project[];
  }> => {
    const res = await apiClient.get('/hr/projects');
    return res.data;
  },

  getProject: async (projectId: number): Promise<Project> => {
    const res = await apiClient.get(`/hr/projects/${projectId}`);
    return res.data;
  },

  rankCandidatesForProject: async (
    projectId: number,
    scanIds?: number[]
  ): Promise<{
    status: string;
    project: {
      id: number;
      project_name: string;
      project_code: string;
      team_capacity: number;
      allocated_count: number;
      extracted_requirements: Record<string, any>;
    };
    kpis: {
      total_candidates_analyzed: number;
      top_match_percentage: number;
      average_match_percentage: number;
      strong_matches_count: number;
      allocated_count: number;
      team_capacity: number;
    };
    ranked_candidates: RankedCandidate[];
  }> => {
    const payload = scanIds && scanIds.length > 0 ? { scan_ids: scanIds } : undefined;
    const res = await apiClient.post(`/hr/projects/${projectId}/rank-candidates`, payload);
    return res.data;
  },

  updateCandidateAllocationStatus: async (
    projectId: number,
    candidateId: string | number,
    status: 'ALLOCATED' | 'REJECTED' | 'ON_HOLD' | 'PENDING',
    notes?: string
  ): Promise<{
    status: string;
    candidate_id: number;
    candidate_name: string;
    new_status: string;
    allocated_at?: string;
    project_id: number;
    allocated_count: number;
    team_capacity: number;
    message: string;
  }> => {
    const res = await apiClient.post(`/hr/projects/${projectId}/candidates/${candidateId}/status`, {
      status,
      notes,
    });
    return res.data;
  },

  getProjectAllocatedResources: async (
    projectId: number
  ): Promise<{
    status: string;
    project_id: number;
    team_capacity: number;
    allocated_count: number;
    allocated_resources: CandidateAllocation[];
  }> => {
    const res = await apiClient.get(`/hr/projects/${projectId}/allocated-resources`);
    return res.data;
  },

  deleteProject: async (
    projectId: number
  ): Promise<{
    status: string;
    message: string;
    deleted_project_id: number;
    deallocated_candidates_count: number;
  }> => {
    const res = await apiClient.delete(`/hr/projects/${projectId}`);
    return res.data;
  },

  getCandidateProjectProfile: async (
    projectId: number,
    candidateId: string | number
  ): Promise<any> => {
    const res = await apiClient.get(`/hr/projects/${projectId}/candidates/${candidateId}`);
    return res.data;
  },

  // ============================================================
  // BACKWARD-COMPATIBLE LEGACY JD ALIASES
  // ============================================================

  analyzeJobDescription: async (
    payload:
      | FormData
      | {
          raw_text: string;
          job_title?: string;
        }
  ): Promise<{
    status: string;
    id: number;
    job_title: string;
    created_at: string;
    raw_jd_text: string;
    extracted_requirements:
      Record<string, any>;
  }> => {

    let headers: Record<
      string,
      string
    > = {};

    if (
      payload instanceof FormData
    ) {

      headers[
        'Content-Type'
      ] = 'multipart/form-data';
    }

    const res = await apiClient.post(
      '/hr/job-description/analyze',
      payload,
      {
        headers,
      }
    );

    return res.data;
  },


  getJobDescriptions: async (): Promise<{
    status: string;
    total: number;

    job_descriptions: Array<{
      id: number;
      job_title: string;
      created_at: string;
      extracted_requirements:
        Record<string, any>;
    }>;
  }> => {

    const res = await apiClient.get(
      '/hr/job-descriptions'
    );

    return res.data;
  },


  getJobDescription: async (
    jdId: number
  ): Promise<{
    status: string;
    id: number;
    company_id: string;
    job_title: string;
    raw_jd_text: string;
    extracted_requirements:
      Record<string, any>;
    created_at: string;
  }> => {

    const res = await apiClient.get(
      `/hr/job-descriptions/${jdId}`
    );

    return res.data;
  },


  rankCandidatesForJD: async (
    jdId: number,
    scanIds?: number[]
  ): Promise<{
    status: string;

    job_description: {
      id: number;
      job_title: string;
      extracted_requirements:
        Record<string, any>;
    };

    kpis: {
      total_candidates_analyzed: number;
      top_match_percentage: number;
      average_match_percentage: number;
      strong_matches_count: number;
    };

    ranked_candidates: Array<{
      candidate_id: string | number;
      candidate_name: string;
      candidate_filename: string;
      candidate_email: string;
      score: number;
      rank: number;
      match_status: string;

      score_breakdown: {
        skills: number;
        experience: number;
        education: number;
        certifications: number;
      };

      matched_requirements: Array<{
        category: string;
        requirement: string;
        evidence: string;
      }>;

      missing_requirements: Array<{
        category: string;
        requirement: string;
        reason: string;
      }>;

      recommendation: string;
      extracted_skills: string[];
      uploaded_at?: string;
    }>;
  }> => {

    const payload =
      scanIds &&
      scanIds.length > 0
        ? {
            scan_ids: scanIds,
          }
        : undefined;

    const res = await apiClient.post(
      `/hr/job-description/${jdId}/rank-candidates`,
      payload
    );

    return res.data;
  },


  // ============================================================
  // 9. RAG CHATBOT & CONVERSATION HISTORY
  // ============================================================

  queryChatbot: async (
    question: string,
    sessionId?: string
  ): Promise<{
    answer: string;

    sources: Array<{
      table: string;
      id: number;
      file_name?: string;
      document_name?: string;
      document_type?: string;
    }>;

    records_found: number;
    session_id: string;
  }> => {

    const res = await apiClient.post(
      '/chatbot/query',
      {
        question,
        session_id:
          sessionId || undefined,
      }
    );

    return res.data;
  },


  getChatbotSuggestions: async (): Promise<{
    company_id: string;
    latest_file?: string;
    suggestions: string[];
  }> => {

    const res = await apiClient.get(
      '/chatbot/suggestions'
    );

    return res.data;
  },


  getChatSessions: async (
    limit: number = 50
  ): Promise<Array<{
    session_id: string;
    title: string;
    created_at: string;
    updated_at: string;
    message_count: number;
    latest_message?: string;
  }>> => {

    const res = await apiClient.get(
      `/chatbot/sessions?limit=${limit}`
    );

    return res.data;
  },


  getChatSessionHistory: async (
    sessionId: string
  ): Promise<{
    session_id: string;
    title: string;
    created_at: string;
    updated_at: string;

    messages: Array<{
      id: number;
      session_id: string;
      sender:
        | 'user'
        | 'assistant';
      message_text: string;
      sources?: any[];
      records_found: number;
      created_at: string;
    }>;
  }> => {

    const res = await apiClient.get(
      `/chatbot/sessions/${sessionId}`
    );

    return res.data;
  },


  deleteChatSession: async (
    sessionId: string
  ): Promise<{
    status: string;
    session_id: string;
  }> => {

    const res = await apiClient.delete(
      `/chatbot/sessions/${sessionId}`
    );

    return res.data;
  },


  clearChatHistory: async (): Promise<{
    status: string;
    deleted_sessions: number;
  }> => {

    const res = await apiClient.delete(
      '/chatbot/history'
    );

    return res.data;
  },
};