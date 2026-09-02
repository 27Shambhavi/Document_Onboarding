import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../api/auth';
import {
  AlertCircle,
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Shield,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type AuthMode = 'company_login' | 'company_onboard' | 'admin_login';

interface AuthInputProps {
  id: string;
  label: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  icon: LucideIcon;
  autoComplete?: string;
  required?: boolean;
  rightElement?: React.ReactNode;
}

const AuthInput: React.FC<AuthInputProps> = ({
  id,
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  icon: Icon,
  autoComplete,
  required = true,
  rightElement,
}) => (
  <div className="space-y-1.5">
    <label
      htmlFor={id}
      className="block text-sm font-medium text-foreground"
    >
      {label}
    </label>

    <div className="relative">
      <Icon
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />

      <input
        id={id}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[46px] w-full rounded-xl border border-border bg-card pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/70 transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
      />

      {rightElement}
    </div>
  </div>
);

const SectionHeading: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
    {children}
  </div>
);

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<AuthMode>('company_login');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');

  const isOnboarding = mode === 'company_onboard';
  const isAdmin = mode === 'admin_login';

  const isSubmitDisabled =
    isLoading ||
    !email.trim() ||
    !password ||
    (isOnboarding &&
      (!inviteToken.trim() ||
        !companyId.trim() ||
        !companyName.trim()));

  const pageTitle = isOnboarding
    ? 'Create your company account'
    : isAdmin
      ? 'Administrator sign in'
      : 'Welcome back';

  const pageDescription = isOnboarding
    ? 'Use the onboarding token provided by your DocVerify administrator to register your organization.'
    : isAdmin
      ? 'Sign in to manage DocVerify company onboarding and platform settings.'
      : 'Sign in to continue to your DocVerify workspace.';

  const submitLabel = isOnboarding ? 'Create Company Account' : 'Sign In';

  const loadingLabel = isOnboarding
    ? 'Creating account...'
    : 'Signing in...';

  const passwordToggle = (
    <button
      type="button"
      onClick={() => setShowPassword((current) => !current)}
      aria-label={showPassword ? 'Hide password' : 'Show password'}
      className="absolute right-2.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-card-elevated hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      {showPassword ? (
        <EyeOff className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Eye className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);
    setIsLoading(true);

    try {
      /*
       * ADMIN LOGIN
       * POST /admin/login
       */
      if (mode === 'admin_login') {
        const response = await authApi.adminLogin({
          email: email.trim(),
          password,
        });

        console.log('Admin login successful:', response);

        login(response.access_token, 'admin', {
          email: email.trim(),
        });

        navigate('/admin/dashboard');
      }

      /*
       * COMPANY LOGIN
       * POST /company/login
       */
      else if (mode === 'company_login') {
        const response = await authApi.companyLogin({
          email: email.trim(),
          password,
        });

        console.log('Company login successful:', response);

        login(response.access_token, 'company', {
          id: response.company_id,
          name: response.company_name,
          email: email.trim(),
        });

        navigate('/company/dashboard');
      }

      /*
       * COMPANY ONBOARDING
       * POST /company/onboard
       */
      else {
        const response = await authApi.companyOnboard({
          invite_token: inviteToken.trim(),
          company_id: companyId.trim(),
          company_name: companyName.trim(),
          email: email.trim(),
          password,
        });

        console.log('Company onboarding successful:', response);

        login(response.access_token, 'company', {
          id: response.company_id,
          name: response.company_name,
          email: email.trim(),
        });

        navigate('/company/dashboard');
      }
    } catch (err: any) {
      console.error('========== LOGIN ERROR ==========');
      console.error('Full error:', err);
      console.error('Status:', err?.response?.status);
      console.error('Response:', err?.response?.data);
      console.error('Message:', err?.message);
      console.error('================================');

      const status = err?.response?.status;
      const responseData = err?.response?.data;

      const detail = responseData?.detail;
      const message = responseData?.message;
      const errorMessage = responseData?.error;

      /*
       * FastAPI commonly returns:
       * {
       *   "detail": "some error"
       * }
       */

      if (typeof detail === 'string') {
        setError(detail);
      } else if (typeof message === 'string') {
        setError(message);
      } else if (typeof errorMessage === 'string') {
        setError(errorMessage);
      } else if (status === 400) {
        setError(
          'Invalid request. Please check the information you entered.'
        );
      } else if (status === 401) {
        setError(
          'Invalid email or password. Please verify your credentials.'
        );
      } else if (status === 403) {
        setError(
          'You are not authorized to access this account.'
        );
      } else if (status === 404) {
        setError(
          'Login service was not found. Please check the backend API configuration.'
        );
      } else if (status === 422) {
        setError(
          'Some login information is invalid. Please check the entered fields.'
        );
      } else if (status && status >= 500) {
        setError(
          'The server encountered an error. Please check the backend logs.'
        );
      } else if (!err?.response) {
        setError(
          'Unable to connect to the backend. Make sure FastAPI is running on port 8567.'
        );
      } else {
        setError(
          'Authentication failed. Please verify your information and try again.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setError(null);
    setShowPassword(false);
    setMode(newMode);
  };

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-6 font-sans text-foreground sm:px-6">
      <div className="w-full max-w-[520px]">

        {/* Header */}
        <header className="mx-auto mb-5 text-center">
          <div className="mb-5 flex items-center justify-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-card-elevated text-primary shadow-[0_10px_28px_rgba(255,45,85,0.12)]">
              <Shield
                className="h-5 w-5"
                aria-hidden="true"
              />
            </span>

            <span className="text-[1.35rem] font-bold text-foreground">
              DocVerify
            </span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {pageTitle}
          </h1>

          <p className="mx-auto mt-2 max-w-[440px] text-sm leading-5 text-muted-foreground">
            {pageDescription}
          </p>
        </header>

        {/* Login Card */}
        <section className="rounded-[20px] border border-white/[0.08] bg-card p-6 shadow-[0_20px_60px_rgba(0,0,0,0.3)] sm:p-7">

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="mb-4 flex gap-3 rounded-xl border border-[var(--uncleared)]/25 bg-[var(--uncleared-soft)] px-4 py-3 text-sm leading-5 text-[var(--uncleared)]"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uncleared)]"
                aria-hidden="true"
              />

              <span>{error}</span>
            </div>
          )}

          <form
            className={isOnboarding ? 'space-y-5' : 'space-y-4'}
            onSubmit={handleSubmit}
          >

            {/* Onboarding Token */}
            {isOnboarding && (
              <div className="space-y-3.5">
                <SectionHeading>
                  Onboarding
                </SectionHeading>

                <AuthInput
                  id="invite-token"
                  label="Invite / Onboarding Token"
                  placeholder="Enter your onboarding token"
                  value={inviteToken}
                  onChange={setInviteToken}
                  icon={KeyRound}
                  autoComplete="one-time-code"
                />

                <p className="-mt-1 text-xs leading-5 text-muted-foreground">
                  Enter the token provided by your DocVerify administrator.
                </p>
              </div>
            )}

            {/* Company Information */}
            {isOnboarding && (
              <div className="space-y-3.5 border-t border-border pt-5">
                <SectionHeading>
                  Company Information
                </SectionHeading>

                <AuthInput
                  id="company-id"
                  label="Company ID"
                  placeholder="Enter company ID"
                  value={companyId}
                  onChange={setCompanyId}
                  icon={Building2}
                  autoComplete="organization"
                />

                <AuthInput
                  id="company-name"
                  label="Company Legal Name"
                  placeholder="Enter legal company name"
                  value={companyName}
                  onChange={setCompanyName}
                  icon={Building2}
                  autoComplete="organization"
                />
              </div>
            )}

            {/* Account Details */}
            <div
              className={
                isOnboarding
                  ? 'space-y-3.5 border-t border-border pt-5'
                  : 'space-y-4'
              }
            >
              {isOnboarding && (
                <SectionHeading>
                  Account Details
                </SectionHeading>
              )}

              <AuthInput
                id="email"
                label="Email Address"
                type="email"
                placeholder="Enter work email"
                value={email}
                onChange={setEmail}
                icon={Mail}
                autoComplete="email"
              />

              <AuthInput
                id="password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password"
                value={password}
                onChange={setPassword}
                icon={LockKeyhole}
                autoComplete={
                  isOnboarding
                    ? 'new-password'
                    : 'current-password'
                }
                rightElement={passwordToggle}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="flex h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(255,45,85,0.18)] transition hover:bg-[#E11D48] focus:outline-none focus:ring-4 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading && (
                <Loader2
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}

              {isLoading
                ? loadingLabel
                : submitLabel}
            </button>
          </form>
        </section>

        {/* Footer */}
        <footer className="mt-4 text-center text-sm">
          {isOnboarding ? (
            <p className="text-muted-foreground">
              Already have an account?{' '}

              <button
                type="button"
                onClick={() =>
                  switchMode('company_login')
                }
                className="font-semibold text-primary transition hover:text-[#E11D48] focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                Sign in
              </button>
            </p>
          ) : (
            <div className="space-y-2">

              <p className="text-muted-foreground">
                Don't have an account?{' '}

                <button
                  type="button"
                  onClick={() =>
                    switchMode('company_onboard')
                  }
                  className="font-semibold text-primary transition hover:text-[#E11D48] focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  Register via onboarding token
                </button>
              </p>

              {isAdmin ? (
                <button
                  type="button"
                  onClick={() =>
                    switchMode('company_login')
                  }
                  className="text-xs font-semibold text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  Return to company sign in
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    switchMode('admin_login')
                  }
                  className="text-xs font-semibold text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  Platform administrator?
                </button>
              )}
            </div>
          )}
        </footer>
      </div>
    </main>
  );
};