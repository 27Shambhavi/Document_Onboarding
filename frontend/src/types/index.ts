// Admin Login Types
export interface AdminLoginRequest {
  email: string;
  password: string;
}

export interface AdminLoginResponse {
  access_token: string;
  token_type: string;
  role: string;
}

// Company Onboarding & Login Types
export interface CompanyOnboardRequest {
  invite_token: string;
  company_id: string;
  company_name: string;
  email: string;
  password: string;
}

export interface CompanyOnboardResponse {
  status: string;
  message: string;
  company_id: string;
  company_name: string;
  email: string;
  access_token: string;
  token_type: string;
}

export interface CompanyLoginRequest {
  email: string;
  password: string;
}

export interface CompanyLoginResponse {
  access_token: string;
  token_type: string;
  company_id: string;
  company_name: string;
  status: string; // PENDING, ACTIVE, REJECTED
}

// Invite Token Generation
export interface GenerateTokenResponse {
  status: string;
  token: string;
  expires_at: string;
  message: string;
}

// Admin Company Management
export interface CompanyItem {
  company_id: string;
  company_name: string;
  email: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED';
  is_active: boolean;
  created_at: string;
  approved_at: string | null;
  approved_by: number | null;
}

export interface CompanyListResponse {
  total: number;
  companies: CompanyItem[];
}

// Billing & Analytics
export interface UpdatePricingRequest {
  price_per_page: number;
  price_per_signature_check: number;
}

export interface UpdateAddonRequest {
  is_signature_addon_enabled: boolean;
}

export interface UsageRecord {
  log_id: string;
  request_id: string;
  company_id: string;
  total_pages: number;
  signature_checks_count: number;
  cost_incurred: number;
  timestamp: string;
}

export interface CompanyUsageSummary {
  company_id: string;
  company_name: string;
  period: string;
  total_scans: number;
  total_pages: number;
  total_signature_checks: number;
  estimated_invoice_inr: number;
  is_signature_addon_enabled: boolean;
  usage_logs: UsageRecord[];
}

export interface CompanyUsageBrief {
  company_id: string;
  company_name: string;
  total_scans: number;
  total_pages: number;
  total_cost: number;
}

export interface PlatformOverview {
  period: string;
  active_pricing: {
    price_per_page: number;
    price_per_signature_check: number;
    currency: string;
    updated_at: string;
  };
  platform_totals: {
    total_companies_registered: number;
    total_requests_processed: number;
    total_pages_processed: number;
    total_signatures_scanned: number;
    total_revenue_generated: number;
    currency: string;
  };
  companies_breakdown: Array<{
    company_id: string;
    company_name: string;
    signature_addon: boolean;
    requests: number;
    pages: number;
    signatures: number;
    amount_due: number;
  }>;
}

// Guidelines & Verification Types
export interface DocumentFileItem {
  id: string;
  label: string;
  url?: string | null;
  ocr_data?: Record<string, any> | null;
}

export interface GuidelineVerdictItem {
  id: string;
  cleared_guidelines: string[];
  uncleared_guidelines: string[];
}

export interface GuidelineCheckRequest {
  files: DocumentFileItem[];
  guidelines?: string[];
  customer_id?: string;
  requestId?: string;
  webhook_url?: string;
  guideline_check: boolean;
}

export interface GuidelineCheckResponse {
  status: string;
  requestId?: string;
  customer_id?: string;
  total_documents: number;
  guideline: GuidelineVerdictItem[];
}

export interface SaveGuidelinesPayload {
  guidelines: string[];
  rules?: any[];
  company_id?: string | null;
  blueprint?: Record<string, any>;
}

export interface GetGuidelinesResponse {
  company_id: string;
  total_guidelines: number;
  guidelines: string[];
}

// Document Pipelines & OCR
export interface PipelineDocument {
  id: string;
  url: string | null;
  label: string;
  ocr_data: Record<string, any> & {
    doc_quality?: 'Good' | 'Bad';
    doc_quality_issues?: string;
  };
}

export interface OCRResult {
  status: string;
  filename: string;
  total_pages: number;
  documents: PipelineDocument[];
}

export interface CandidateOCRData {
  candidate_file: string;
  requestId: string;
  customer_id: string;
  total_documents_detected: number;
  files: PipelineDocument[];
}

export interface Stage1OCRResponse {
  status: string;
  company_id: string;
  blueprint_applied: boolean;
  total_candidates: number;
  candidates_ocr_data: CandidateOCRData[];
  failures: any[];
}

export interface CandidateVerificationResult {
  candidate_file: string;
  requestId: string;
  customer_id: string;
  total_documents_detected: number;
  guideline: GuidelineVerdictItem[];
}

export interface Stage2VerificationResponse {
  status: string;
  company_id: string;
  total_guidelines_evaluated: number;
  verified_candidates: CandidateVerificationResult[];
}

export interface AuditCandidateFolderResponse {
  status: string;
  company_id: string;
  total_candidates_processed: number;
  total_guidelines_applied: number;
  candidates: CandidateVerificationResult[];
  failures: any[];
}
