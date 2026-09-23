import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../App';
import { api } from '../api/client';
import type { DocumentScan } from '../api/client';
import {
  FileText,
  Users,
  ArrowUpRight,
  Zap,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sliders,
  FileSearch,
} from 'lucide-react';

export const HomeDashboard: React.FC = () => {
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [totalDocs, setTotalDocs] = useState<number>(0);
  const [totalCandidates, setTotalCandidates] = useState<number>(0);
  const [recentAudits, setRecentAudits] = useState<DocumentScan[]>([]);



  useEffect(() => {
    let isMounted = true;

    const fetchRealData = async () => {
      setLoading(true);

      // 1. Fetch scan history from PostgreSQL (Task 1) — persists across page refreshes
      try {
        const scansRes = await api.getCompanyScans(20);
        if (isMounted) {
          const scans = scansRes.scans || [];
          setTotalDocs(scans.length);                              // Distinct scan records
          setTotalCandidates(scansRes.total_pages_scanned ?? 0);   // Total pages processed
          setRecentAudits(scans);
        }
      } catch {
        // No scans yet — stays 0
      }

      if (isMounted) setLoading(false);
    };

    fetchRealData();
    return () => { isMounted = false; };
  }, []);

  const handleScanClick = (scan: DocumentScan) => {
    navigate(`/scan/${scan.id}`);
  };

  return (
    <div className="space-y-8">
      
      {/* 1. WELCOME HERO BANNER */}
      <div
        className={`relative overflow-hidden rounded-3xl p-6 md:p-8 border transition-all ${
          isDark
            ? 'bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-slate-800 shadow-2xl shadow-indigo-950/20'
            : 'bg-gradient-to-r from-indigo-900 via-indigo-800 to-blue-900 text-white border-indigo-700 shadow-xl'
        }`}
      >
        <div className="absolute -right-12 -top-12 w-64 h-64 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
        <div className="absolute right-48 -bottom-12 w-48 h-48 rounded-full bg-blue-500/20 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight leading-tight">
              AI-Powered Document Onboarding &amp; Rule Verification
            </h2>

            <p className={`text-sm md:text-base leading-relaxed ${isDark ? 'text-slate-300' : 'text-indigo-100'}`}>
              DocVerify automates candidate document extraction, blueprint validation, and multi-stage compliance auditing. Scan government IDs, passports, and tax forms with real-time accuracy scoring.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate('/audit')}
                className="px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-sm shadow-lg shadow-indigo-500/30 transition-all flex items-center space-x-2 group cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-current text-amber-300" />
                <span>Launch 1-Click Audit Engine</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                onClick={() => navigate('/config')}
                className={`px-5 py-2.5 rounded-xl font-semibold text-sm border transition-all flex items-center space-x-2 cursor-pointer ${
                  isDark
                    ? 'bg-slate-900/80 hover:bg-slate-800 border-slate-700 text-slate-200'
                    : 'bg-white/10 hover:bg-white/20 border-white/20 text-white backdrop-blur-sm'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>Configure OCR Blueprint</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. DYNAMIC METRICS GRID — DB-BACKED, PERSISTS ACROSS REFRESHES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* STAT 1: Total Docs Uploaded */}
        <div className={`p-6 rounded-2xl border transition-all ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold tracking-wider uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Total Documents Uploaded
            </span>
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold tracking-tight">
              {loading ? (
                <span className="inline-block w-16 h-8 bg-slate-700/30 animate-pulse rounded" />
              ) : (
                totalDocs.toLocaleString()
              )}
            </span>
            <span className="text-xs font-semibold text-indigo-400">Logged in DB</span>
          </div>
          <p className={`text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Distinct scans persisted to PostgreSQL
          </p>
        </div>

        {/* STAT 2: Candidates Processed (total pages) */}
        <div className={`p-6 rounded-2xl border transition-all ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold tracking-wider uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Candidates Processed
            </span>
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-extrabold tracking-tight">
              {loading ? (
                <span className="inline-block w-16 h-8 bg-slate-700/30 animate-pulse rounded" />
              ) : (
                totalCandidates.toLocaleString()
              )}
            </span>
            <span className="text-xs font-semibold text-blue-400">Total Pages</span>
          </div>
          <p className={`text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Pages scanned across all audit runs
          </p>
        </div>

      </div>

      {/* 3. RECENT AUDIT HISTORY (DB-BACKED — CLICKABLE) & ARCHITECTURE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* RECENT AUDITS FEED */}
        <div className={`lg:col-span-2 p-6 rounded-2xl border ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold tracking-tight">Recent Candidate Audits</h3>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Click any row to view the saved OCR JSON from PostgreSQL
              </p>
            </div>
            <button
              onClick={() => navigate('/audit')}
              className="text-xs font-semibold text-indigo-500 hover:text-indigo-400 flex items-center gap-1"
            >
              <span>Go to Audit Engine</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentAudits.length > 0 ? (
            <div className="space-y-3">
              {recentAudits.map((scan) => (
                <button
                  key={scan.id}
                  onClick={() => handleScanClick(scan)}
                  className={`w-full p-4 rounded-xl border transition-all text-left flex items-center justify-between group ${
                    isDark
                      ? 'bg-slate-950/60 border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900'
                      : 'bg-slate-50/80 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold truncate">{scan.filename}</h4>
                        {scan.has_guidelines && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 flex-shrink-0">
                            Guideline Audit
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">
                        {scan.pages_count} {scan.pages_count === 1 ? 'page' : 'pages'} · ₹{scan.cost_inr.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {new Date(scan.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className={`p-8 rounded-2xl border text-center space-y-3 ${
              isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center mx-auto">
                <FileSearch className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold">No Candidate Audits Logged Yet</h4>
                <p className={`text-xs max-w-sm mx-auto mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Upload candidate IDs, passports, or document bundles in the Audit Engine to generate live compliance verification streams.
                </p>
              </div>
              <button
                onClick={() => navigate('/audit')}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all inline-flex items-center gap-1.5"
              >
                <span>Launch First Candidate Audit</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* ARCHITECTURE WORKFLOW STEPS */}
        <div className={`p-6 rounded-2xl border flex flex-col justify-between ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div>
            <h3 className="text-lg font-bold tracking-tight mb-1">Architecture Pipeline</h3>
            <p className={`text-xs mb-6 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              End-to-end multi-layer verification steps
            </p>

            <div className="space-y-4">
              {[
                { n: '1', title: 'OCR Blueprint Extraction', desc: 'Normalizes identity scans against registered JSON target schemas.' },
                { n: '2', title: 'Guideline Reasoning Engine', desc: 'Evaluates rule conditions against candidate OCR payloads.' },
                { n: '3', title: 'DB Persistence & Human UI', desc: 'Every scan persisted to PostgreSQL. Dual-view reporting with Profile Card grids.' },
              ].map(({ n, title, desc }) => (
                <div key={n} className="flex items-start space-x-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5">
                    {n}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold">{title}</h4>
                    <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200/10 mt-6">
            <button
              onClick={() => navigate('/config')}
              className={`w-full py-2.5 px-4 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
                isDark
                  ? 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-200'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
              }`}
            >
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>Manage Compliance Guidelines</span>
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};


export default HomeDashboard;
