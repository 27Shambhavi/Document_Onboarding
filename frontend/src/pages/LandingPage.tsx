import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, FileCheck, Brain, Zap, Building2, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();

  const handleCTA = () => {
    if (isAuthenticated) {
      if (role === 'admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/company/dashboard');
      }
    } else {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between relative overflow-hidden font-sans transition-colors duration-300">
      {/* Background ambient light/dark glow */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/5 blur-[150px] rounded-full pointer-events-none" />

      {/* Navbar */}
      <nav className="border-b border-border bg-card/85 backdrop-blur-xl relative z-10 transition-colors">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-3">
              <Shield className="h-6.5 w-6.5 text-primary filter drop-shadow-[0_0_4px_rgba(255,45,85,0.2)]" />
              <span className="font-bold text-lg text-foreground tracking-tight">
                DocVerify
              </span>
            </div>
            <div className="flex items-center">
              <button
                onClick={handleCTA}
                className="h-10 px-5 text-sm font-semibold rounded-xl text-white bg-primary hover:bg-primary/90 transition-all duration-200 shadow-md shadow-primary/10"
              >
                {isAuthenticated ? 'Go to Console' : 'Sign In'}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col justify-center py-16 px-6 sm:px-8 relative z-10 max-w-7xl mx-auto w-full">
        <div className="text-center space-y-8 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase bg-primary/10 text-primary border border-primary/20">
            <Zap className="h-4 w-4 text-primary fill-primary/10" />
            Next-Gen Document Intelligence Engine
          </div>
          
          <h1 className="text-4xl sm:text-6xl font-semibold text-foreground tracking-tight leading-tight">
            AI-Powered Enterprise <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-rose-500 font-extrabold">
              Document Onboarding
            </span>
          </h1>
          
          <p className="max-w-2xl mx-auto text-base sm:text-lg text-muted-foreground leading-relaxed font-normal">
            Streamline candidate verification with automated classification, structured key-value data extraction, and strict policy guideline auditing.
          </p>

          <div className="flex justify-center pt-2">
            <button
              onClick={handleCTA}
              className="inline-flex items-center gap-2 px-6 h-12 border border-transparent text-sm font-semibold rounded-xl text-white bg-primary hover:bg-primary/95 transition-all duration-200 shadow-lg shadow-primary/20 hover:scale-[1.01] active:scale-[0.98]"
            >
              Access Platform Console
              <ArrowRight className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Features Grid */}
          <div className="pt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            <div className="bg-card border border-border p-6 sm:p-8 rounded-2xl shadow-sm hover:border-primary/20 hover:shadow-md transition-all duration-300">
              <div className="p-3 bg-primary/10 text-primary rounded-xl w-fit mb-5 border border-primary/15">
                <Brain className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Intelligent Extraction</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Automated document classification and structural OCR extraction targeting IDs and compliance forms.
              </p>
            </div>

            <div className="bg-card border border-border p-6 sm:p-8 rounded-2xl shadow-sm hover:border-primary/20 hover:shadow-md transition-all duration-300">
              <div className="p-3 bg-primary/10 text-primary rounded-xl w-fit mb-5 border border-primary/15">
                <FileCheck className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Contract Compliance</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Evaluate custom, company-specific rules and target criteria. Generate clear audit verification trails.
              </p>
            </div>

            <div className="bg-card border border-border p-6 sm:p-8 rounded-2xl shadow-sm hover:border-primary/20 hover:shadow-md transition-all duration-300">
              <div className="p-3 bg-primary/10 text-primary rounded-xl w-fit mb-5 border border-primary/15">
                <Building2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Multi-Tenant Console</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                SaaS infrastructure with separate, secure administration controls and clients dashboard consoles.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-6 relative z-10 transition-colors">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} DocVerify. All rights reserved.
        </div>
      </footer>
    </div>
  );
};
