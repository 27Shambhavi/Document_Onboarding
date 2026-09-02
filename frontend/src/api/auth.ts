import { apiClient } from './client';
import type {
  AdminLoginRequest,
  AdminLoginResponse,
  CompanyLoginRequest,
  CompanyLoginResponse,
  CompanyOnboardRequest,
  CompanyOnboardResponse,
} from '../types';

export const authApi = {
  adminLogin: async (data: AdminLoginRequest): Promise<AdminLoginResponse> => {
    const response = await apiClient.post<AdminLoginResponse>('/admin/login', data);
    return response.data;
  },

  companyLogin: async (data: CompanyLoginRequest): Promise<CompanyLoginResponse> => {
    const response = await apiClient.post<CompanyLoginResponse>('/company/login', data);
    return response.data;
  },

  companyOnboard: async (data: CompanyOnboardRequest): Promise<CompanyOnboardResponse> => {
    const response = await apiClient.post<CompanyOnboardResponse>('/company/onboard', data);
    return response.data;
  },
};
