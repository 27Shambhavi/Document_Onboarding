import { apiClient } from './client';
import type {
  SaveGuidelinesPayload,
  GetGuidelinesResponse,
  CompanyUsageSummary,
} from '../types';

export const companyApi = {
  getGuidelines: async (): Promise<GetGuidelinesResponse> => {
    const response = await apiClient.get<GetGuidelinesResponse>('/company/guidelines');
    return response.data;
  },

  saveGuidelines: async (data: SaveGuidelinesPayload): Promise<any> => {
    const response = await apiClient.post('/company/guidelines', data);
    return response.data;
  },

  uploadPolicyDoc: async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/company/guidelines/upload-policy', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  registerBlueprintJson: async (blueprint: Record<string, string[]>): Promise<any> => {
    const response = await apiClient.post('/company/register-blueprint-json', blueprint);
    return response.data;
  },

  registerBlueprintDoc: async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/company/register-blueprint-doc', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getClientUsageSummary: async (period = 'monthly'): Promise<CompanyUsageSummary> => {
    const response = await apiClient.get<CompanyUsageSummary>('/client/usage/summary', {
      params: { period },
    });
    return response.data;
  },

  getBlueprint: async (): Promise<any> => {
    const response = await apiClient.get<any>('/company/blueprint');
    return response.data;
  },
};
