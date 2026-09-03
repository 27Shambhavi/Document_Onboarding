import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Layout } from '../layouts/Layout';

// Pages
import { LandingPage } from '../pages/LandingPage';
import { Login } from '../pages/auth/Login';
import { AdminDashboard } from '../pages/admin/AdminDashboard';
import { CompaniesList } from '../pages/admin/CompaniesList';
import { CompanyDetails } from '../pages/admin/CompanyDetails';
import { AdminSettings } from '../pages/admin/AdminSettings';
import { CompanyDashboard } from '../pages/company/CompanyDashboard';
import { GuidelinesConfig } from '../pages/company/GuidelinesConfig';
import { DocumentDetails } from '../pages/company/DocumentDetails';
import { DocumentsList } from '../pages/company/DocumentsList';
import { UploadDocuments } from '../pages/company/UploadDocuments';
import { CompanySettings } from '../pages/company/CompanySettings';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRole: 'admin' | 'company';
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRole }) => {
  const { isAuthenticated, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role !== allowedRole) {
    return <Navigate to={role === 'admin' ? '/admin/dashboard' : '/company/dashboard'} replace />;
  }

  return <Layout>{children}</Layout>;
};

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Pages */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />

      {/* Admin Panel Console */}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute allowedRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/companies"
        element={
          <ProtectedRoute allowedRole="admin">
            <CompaniesList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/companies/:companyId"
        element={
          <ProtectedRoute allowedRole="admin">
            <CompanyDetails />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute allowedRole="admin">
            <AdminSettings />
          </ProtectedRoute>
        }
      />

      {/* Company/Client Console */}
      <Route
        path="/company/dashboard"
        element={
          <ProtectedRoute allowedRole="company">
            <CompanyDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/company/guidelines"
        element={
          <ProtectedRoute allowedRole="company">
            <GuidelinesConfig />
          </ProtectedRoute>
        }
      />
      <Route
        path="/company/onboarding"
        element={
          <ProtectedRoute allowedRole="company">
            <UploadDocuments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/company/upload"
        element={
          <ProtectedRoute allowedRole="company">
            <UploadDocuments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/company/documents"
        element={
          <ProtectedRoute allowedRole="company">
            <DocumentsList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/company/documents/:docId"
        element={
          <ProtectedRoute allowedRole="company">
            <DocumentDetails />
          </ProtectedRoute>
        }
      />
      <Route
        path="/company/settings"
        element={
          <ProtectedRoute allowedRole="company">
            <CompanySettings />
          </ProtectedRoute>
        }
      />

      {/* Fallbacks */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

// Providing BOTH named and default export to prevent any import mismatches
export default AppRoutes;