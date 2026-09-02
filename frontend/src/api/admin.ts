import { apiClient } from './client';
import type {
  GenerateTokenResponse,
  CompanyListResponse,
  PlatformOverview,
  CompanyUsageSummary,
  UpdatePricingRequest,
  UpdateAddonRequest,
} from '../types';

export const adminApi = {
  generateInviteToken: async (): Promise<GenerateTokenResponse> => {
    const response = await apiClient.post<GenerateTokenResponse>('/admin/tokens/generate');
    return response.data;
  },

  getCompanies: async (): Promise<CompanyListResponse> => {
    const response = await apiClient.get<CompanyListResponse>('/admin/companies');
    return response.data;
  },

  approveCompany: async (companyId: string): Promise<any> => {
    const response = await apiClient.post(`/admin/companies/${companyId}/approve`);
    return response.data;
  },

  rejectCompany: async (companyId: string): Promise<any> => {
    const response = await apiClient.post(`/admin/companies/${companyId}/reject`);
    return response.data;
  },

  getPlatformOverview: async (period = 'monthly'): Promise<PlatformOverview> => {
    const response = await apiClient.get<PlatformOverview>(`/admin/analytics/overview`, {
      params: { period },
    });
    return response.data;
  },

  getCompanyUsage: async (companyId: string, period = 'monthly'): Promise<CompanyUsageSummary> => {
    const response = await apiClient.get<CompanyUsageSummary>(`/admin/analytics/companies/${companyId}`, {
      params: { period },
    });
    return response.data;
  },

  updatePricingRates: async (data: UpdatePricingRequest): Promise<any> => {
    const response = await apiClient.put(`/admin/billing/pricing`, data);
    return response.data;
  },

  toggleSignatureAddon: async (companyId: string, data: UpdateAddonRequest): Promise<any> => {
    const response = await apiClient.patch(`/admin/companies/${companyId}/signature-addon`, data);
    return response.data;
  },
};
