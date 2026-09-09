import React, { useState, useEffect } from 'react';
import {
  Briefcase,
  Users,
  Award,
  TrendingUp,
  Sparkles,
  FileText,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Plus,
  CheckSquare,
  Square,
  Search,
} from 'lucide-react';
import { api } from '../api/client';
import type { DocumentScan } from '../api/client';
import { JDAnalysisPanel } from '../components/hr/JDAnalysisPanel';
import {
  CandidateRankingTable,
} from '../components/hr/CandidateRankingTable';
import type { RankedCandidateItem } from '../components/hr/CandidateRankingTable';
import { CandidateDetailDrawer } from '../components/hr/CandidateDetailDrawer';

export const HRRankingDashboard: React.FC = () => {
  // 1. Saved JDs and Selected JD (Hydrated from sessionStorage)
  const [jobDescriptions, setJobDescriptions] = useState<any[]>([]);
  const [selectedJdId, setSelectedJdId] = useState<number | null>(() => {
    try {
      const saved = sessionStorage.getItem('docverify_hr_active_jd_id');
      return saved ? Number(saved) : null;
    } catch {
      return null;
    }
  });

  const [selectedJdDetail, setSelectedJdDetail] = useState<any | null>(() => {
    try {
      const saved = sessionStorage.getItem('docverify_hr_active_jd_detail');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // 2. Candidate Selection State (Hydrated from sessionStorage)
  const [availableScans, setAvailableScans] = useState<DocumentScan[]>([]);
  const [isLoadingScans, setIsLoadingScans] = useState(false);
  const [scanFilterTerm, setScanFilterTerm] = useState('');
  const [selectedScanIds, setSelectedScanIds] = useState<number[]>(() => {
    try {
      const saved = sessionStorage.getItem('docverify_hr_selected_scan_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 3. New JD Input State
  const [showJdModal, setShowJdModal] = useState(false);
  const [jdTextInput, setJdTextInput] = useState('');
  const [jdTitleInput, setJdTitleInput] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isAnalyzingJd, setIsAnalyzingJd] = useState(false);

  // 4. Candidate Ranking State (Hydrated from sessionStorage)
  const [isRanking, setIsRanking] = useState(false);
  const [rankingStage, setRankingStage] = useState<string>('');
  const [rankedCandidates, setRankedCandidates] = useState<RankedCandidateItem[]>(() => {
    try {
      const saved = sessionStorage.getItem('docverify_hr_ranked_candidates');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [kpis, setKpis] = useState(() => {
    try {
      const saved = sessionStorage.getItem('docverify_hr_kpis');
      return saved
        ? JSON.parse(saved)
        : {
            total_candidates_analyzed: 0,
            top_match_percentage: 0,
            average_match_percentage: 0,
            strong_matches_count: 0,
          };
    } catch {
      return {
        total_candidates_analyzed: 0,
        top_match_percentage: 0,
        average_match_percentage: 0,
        strong_matches_count: 0,
      };
    }
  });

  // 5. Drawer & Notifications
  const [selectedCandidate, setSelectedCandidate] = useState<RankedCandidateItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // -------------------------------------------------------------
  // STATE PERSISTENCE: Synchronize to sessionStorage
  // -------------------------------------------------------------
  useEffect(() => {
    try {
      if (selectedJdId !== null) {
        sessionStorage.setItem('docverify_hr_active_jd_id', String(selectedJdId));
      } else {
        sessionStorage.removeItem('docverify_hr_active_jd_id');
      }
    } catch (e) {
      console.warn('Failed to save active_jd_id to sessionStorage', e);
    }
  }, [selectedJdId]);

  useEffect(() => {
    try {
      if (selectedJdDetail) {
        sessionStorage.setItem('docverify_hr_active_jd_detail', JSON.stringify(selectedJdDetail));
      } else {
        sessionStorage.removeItem('docverify_hr_active_jd_detail');
      }
    } catch (e) {
      console.warn('Failed to save active_jd_detail to sessionStorage', e);
    }
  }, [selectedJdDetail]);

  useEffect(() => {
    try {
      sessionStorage.setItem('docverify_hr_ranked_candidates', JSON.stringify(rankedCandidates));
    } catch (e) {
      console.warn('Failed to save ranked_candidates to sessionStorage', e);
    }
  }, [rankedCandidates]);

  useEffect(() => {
    try {
      sessionStorage.setItem('docverify_hr_kpis', JSON.stringify(kpis));
    } catch (e) {
      console.warn('Failed to save kpis to sessionStorage', e);
    }
  }, [kpis]);

  useEffect(() => {
    try {
      sessionStorage.setItem('docverify_hr_selected_scan_ids', JSON.stringify(selectedScanIds));
    } catch (e) {
      console.warn('Failed to save selected_scan_ids to sessionStorage', e);
    }
  }, [selectedScanIds]);

  // -------------------------------------------------------------
  // INITIAL DATA FETCH
  // -------------------------------------------------------------
  useEffect(() => {
    loadJobDescriptions();
    loadAvailableScans();
  }, []);

  const loadJobDescriptions = async () => {
    try {
      const res = await api.getJobDescriptions();
      if (res.job_descriptions && res.job_descriptions.length > 0) {
        setJobDescriptions(res.job_descriptions);
        // If nothing was hydrated from sessionStorage, default to the latest JD
        if (!selectedJdId && !selectedJdDetail) {
          const first = res.job_descriptions[0];
          setSelectedJdId(first.id);
          fetchJdDetail(first.id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load job descriptions:', err);
    }
  };

  const loadAvailableScans = async () => {
    setIsLoadingScans(true);
    try {
      const res = await api.getCompanyScans(100, 0);
      const scans = res.scans || [];
      setAvailableScans(scans);
      // Auto-select all if user has not customized selections yet
      setSelectedScanIds((prev) => {
        if (prev.length === 0 && scans.length > 0) {
          return scans.map((s) => s.id);
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to load company scans:', err);
    } finally {
      setIsLoadingScans(false);
    }
  };

  const fetchJdDetail = async (jdId: number) => {
    try {
      setErrorMessage(null);
      const jd = await api.getJobDescription(jdId);
      setSelectedJdDetail(jd);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to fetch JD details.');
    }
  };

  // -------------------------------------------------------------
  // CANDIDATE SELECTION HANDLERS
  // -------------------------------------------------------------
  const toggleSelectScan = (scanId: number) => {
    setSelectedScanIds((prev) =>
      prev.includes(scanId) ? prev.filter((id) => id !== scanId) : [...prev, scanId]
    );
  };

  const handleSelectAllScans = () => {
    setSelectedScanIds(availableScans.map((s) => s.id));
  };

  const handleDeselectAllScans = () => {
    setSelectedScanIds([]);
  };

  const filteredScans = availableScans.filter((s) =>
    s.filename.toLowerCase().includes(scanFilterTerm.toLowerCase())
  );

  // -------------------------------------------------------------
  // ANALYZE NEW JD HANDLER
  // -------------------------------------------------------------
  const handleAnalyzeNewJd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jdTextInput.trim() && !uploadedFile) {
      setErrorMessage('Please provide either raw Job Description text or upload a document file.');
      return;
    }

    setIsAnalyzingJd(true);
    setErrorMessage(null);

    try {
      let result;
      if (uploadedFile) {
        const formData = new FormData();
        formData.append('file', uploadedFile);
        if (jdTitleInput.trim()) formData.append('job_title', jdTitleInput.trim());
        result = await api.analyzeJobDescription(formData);
      } else {
        result = await api.analyzeJobDescription({
          raw_text: jdTextInput,
          job_title: jdTitleInput.trim() || undefined,
        });
      }

      setSuccessMessage(`Job specification '${result.job_title}' analyzed & saved successfully!`);
      setShowJdModal(false);
      setJdTextInput('');
      setJdTitleInput('');
      setUploadedFile(null);

      // Refresh list and select new JD
      await loadJobDescriptions();
      setSelectedJdId(result.id);
      setSelectedJdDetail(result);

      // Run ranking with current selected scan IDs
      await runCandidateRanking(result.id, selectedScanIds);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to analyze Job Description.');
    } finally {
      setIsAnalyzingJd(false);
    }
  };

  // -------------------------------------------------------------
  // RUN CANDIDATE RANKING WITH TARGET SCAN IDS & EXPLICIT FINALLY
  // -------------------------------------------------------------
  const runCandidateRanking = async (jdId: number, targetScanIds?: number[]) => {
    const idsToRank = targetScanIds !== undefined ? targetScanIds : selectedScanIds;

    if (idsToRank.length === 0) {
      setErrorMessage('Please select at least 1 candidate document scan to evaluate.');
      return;
    }

    setIsRanking(true);
    setErrorMessage(null);

    // Progressive step indicator
    setRankingStage('1/3: Ingesting target requirements & competencies...');
    const t1 = setTimeout(() => {
      setRankingStage('2/3: Scanning tenant candidates from Document OCR database...');
    }, 600);
    const t2 = setTimeout(() => {
      setRankingStage('3/3: Synthesizing Explainable AI match vectors & compatibility proofs...');
    }, 1400);

    try {
      const res = await api.rankCandidatesForJD(jdId, idsToRank);
      setRankedCandidates(res.ranked_candidates as RankedCandidateItem[]);
      setKpis(res.kpis);
      setSuccessMessage(
        `Successfully evaluated ${res.ranked_candidates.length} candidate(s) against ${
          selectedJdDetail?.job_title || 'target role'
        }!`
      );
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to rank candidates for this JD.');
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      // Guarantee loading state is cleared even if result is empty or an error occurred
      setIsRanking(false);
      setRankingStage('');
    }
  };

  const handleSelectCandidate = (candidate: RankedCandidateItem) => {
    setSelectedCandidate(candidate);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                AI Candidate Match
              </h1>
              <p className="text-slate-500 mt-1">
                Evaluates extracted candidate resume entities directly against structured Job Description requirements with visual evidence proofs.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          {jobDescriptions.length > 0 && (
            <div className="relative">
              <select
                value={selectedJdId || ''}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setSelectedJdId(id);
                  fetchJdDetail(id);
                }}
                disabled={isRanking}
                className="pl-3 pr-8 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer disabled:opacity-50 shadow-sm"
              >
                {jobDescriptions.map((jd) => (
                  <option key={jd.id} value={jd.id}>
                    {jd.job_title} (#{jd.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setShowJdModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Job Description</span>
          </button>

          {selectedJdId && (
            <button
              onClick={() => runCandidateRanking(selectedJdId)}
              disabled={isRanking || selectedScanIds.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 shadow-sm"
              title="Rerun Compatibility AI"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRanking ? 'animate-spin text-indigo-500' : ''}`} />
              <span>Rerun Match</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-600 hover:text-rose-950 font-bold text-base leading-none">
            &times;
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-950 font-bold text-base leading-none">
            &times;
          </button>
        </div>
      )}

      {/* Progressive Loading State Banner */}
      {isRanking && (
        <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 animate-pulse shadow-sm">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-indigo-600 animate-spin flex-shrink-0" />
            <div>
              <div className="text-xs font-bold text-indigo-950">Running Explainable AI Match Engine...</div>
              <div className="text-xs text-indigo-700 mt-0.5 font-mono">{rankingStage}</div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Candidates Analyzed */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-slate-500 uppercase text-xs font-semibold">
                Total Candidates Evaluated
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {kpis.total_candidates_analyzed}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Sourced from OCR Document Scans</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Top Match Score */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-slate-500 uppercase text-xs font-semibold">
                Top Match Compatibility
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {kpis.top_match_percentage}%
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Highest candidate fit</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Average Match */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-slate-500 uppercase text-xs font-semibold">
                Cohort Average Compatibility
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {kpis.average_match_percentage}%
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Across all scanned profiles</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Strong Matches Count */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-slate-500 uppercase text-xs font-semibold">
                Strong Fit Shortlist (75%+)
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {kpis.strong_matches_count}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Qualified for interview stage</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Active JD Analysis Card */}
      {selectedJdDetail ? (
        <JDAnalysisPanel
          jobTitle={selectedJdDetail.job_title}
          extractedRequirements={selectedJdDetail.extracted_requirements || {}}
          rawJdText={selectedJdDetail.raw_jd_text}
          onReanalyze={() => setShowJdModal(true)}
        />
      ) : (
        <div className="p-8 rounded-xl border border-dashed border-slate-300 bg-white text-center shadow-sm">
          <Briefcase className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900">No Job Description Selected</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Upload or paste a Job Description to automatically extract key skills, qualifications, and evaluate your candidate roster.
          </p>
          <button
            onClick={() => setShowJdModal(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Upload or Paste JD</span>
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* CANDIDATE SELECTION SECTION                                */}
      {/* ========================================================= */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center flex-shrink-0">
              <CheckSquare className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Select Candidates to Evaluate
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold font-mono border border-indigo-200">
                  {selectedScanIds.length} of {availableScans.length} Selected
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Target specific resumes from your document store for Explainable AI evaluation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAllScans}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={handleDeselectAllScans}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors cursor-pointer"
            >
              Clear
            </button>
            {selectedJdId && (
              <button
                type="button"
                onClick={() => runCandidateRanking(selectedJdId)}
                disabled={isRanking || selectedScanIds.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {isRanking ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Evaluating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Analyze & Rank Candidates ({selectedScanIds.length})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Scan Filter Input */}
        {availableScans.length > 5 && (
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter available scans by filename..."
              value={scanFilterTerm}
              onChange={(e) => setScanFilterTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        )}

        {/* Candidate Scans Multi-Select Grid */}
        {isLoadingScans ? (
          <div className="py-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
            <span>Loading document scans from database...</span>
          </div>
        ) : availableScans.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">
            No candidate document scans found in repository. Please upload candidate resumes in the{' '}
            <span className="font-semibold text-slate-700">Audit Engine</span> first.
          </div>
        ) : filteredScans.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-500">
            No scans match your search query.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
            {filteredScans.map((scan) => {
              const isSelected = selectedScanIds.includes(scan.id);
              return (
                <div
                  key={scan.id}
                  onClick={() => toggleSelectScan(scan.id)}
                  className={`p-2.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                    isSelected
                      ? 'bg-indigo-50 border-indigo-300 text-slate-900 ring-1 ring-indigo-500/20'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex-shrink-0 text-indigo-500">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate text-slate-900" title={scan.filename}>
                        {scan.filename}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono">#{scan.id}</span>
                        <span>•</span>
                        <span>{scan.pages_count}p</span>
                        {scan.created_at && (
                          <>
                            <span>•</span>
                            <span>{new Date(scan.created_at).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <FileText className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-indigo-500' : 'text-slate-400'}`} />
                </div>
              );
            })}
          </div>
        )}

        {selectedScanIds.length === 0 && (
          <div className="mt-2 text-[11px] text-amber-600 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Select at least 1 candidate scan to run compatibility matching.</span>
          </div>
        )}
      </div>

      {/* Candidate Ranking Roster Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">Ranked Candidate Roster</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono border border-slate-200">
              {rankedCandidates.length} Profiles
            </span>
          </div>
          <div className="text-xs text-slate-500">
            Click any candidate row to inspect the full Explainable AI match proof
          </div>
        </div>

        <CandidateRankingTable
          candidates={rankedCandidates}
          onSelectCandidate={handleSelectCandidate}
          isLoading={isRanking}
        />
      </div>

      {/* Candidate Detail Slide-Over Drawer */}
      <CandidateDetailDrawer
        candidate={selectedCandidate}
        targetJobTitle={selectedJdDetail?.job_title}
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedCandidate(null);
        }}
      />

      {/* New JD Upload / Paste Modal */}
      {showJdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => !isAnalyzingJd && setShowJdModal(false)}
          />
          <div className="relative w-full max-w-2xl rounded-xl bg-white border border-slate-200 p-6 shadow-xl z-10 text-slate-900">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Add Job Description</h3>
                  <p className="text-xs text-slate-500">Extract requirements via AI text intelligence</p>
                </div>
              </div>
              <button
                onClick={() => !isAnalyzingJd && setShowJdModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAnalyzeNewJd} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Job Position Title (Optional override)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Senior Full-Stack Engineer"
                  value={jdTitleInput}
                  onChange={(e) => setJdTitleInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Paste Job Description Text
                </label>
                <textarea
                  rows={7}
                  placeholder="Paste complete Job Description requirements, qualifications, and role responsibilities here..."
                  value={jdTextInput}
                  onChange={(e) => setJdTextInput(e.target.value)}
                  className="w-full p-3 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500/50 leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-[11px] text-slate-500 uppercase font-semibold">OR Upload File</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Upload JD Document (.pdf, .docx, .txt)
                </label>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setUploadedFile(e.target.files[0]);
                    }
                  }}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
                />
                {uploadedFile && (
                  <div className="mt-1 text-[11px] text-indigo-600 flex items-center gap-1 font-mono">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Selected: {uploadedFile.name}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowJdModal(false)}
                  disabled={isAnalyzingJd}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAnalyzingJd}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isAnalyzingJd ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span>Extracting Requirements via AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Analyze & Match Candidates</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
