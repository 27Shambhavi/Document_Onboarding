import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderKanban,
  Users,
  Sparkles,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  FileText,
  Search,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  Clock,
  GraduationCap,
  Layers,
  Hash,
} from 'lucide-react';
import { api } from '../api/client';
import type { Project, CandidateAllocation, DocumentScan } from '../api/client';
import { AllocatedResourcesGrid } from '../components/hr/AllocatedResourcesGrid';
import { CandidateRankingTable, type RankedCandidateItem } from '../components/hr/CandidateRankingTable';

export const ProjectDetailDashboard: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const parsedProjectId = Number(projectId);

  // Active Tab: 'team' | 'scan'
  const [activeTab, setActiveTab] = useState<'team' | 'scan'>('team');

  // Project Data State
  const [project, setProject] = useState<Project | null>(null);
  const [allocatedResources, setAllocatedResources] = useState<CandidateAllocation[]>([]);
  const [isLoadingProject, setIsLoadingProject] = useState<boolean>(true);
  const [showProjectSpec, setShowProjectSpec] = useState<boolean>(false);

  // Tenant Scans (Candidates from OCR database)
  const [scans, setScans] = useState<DocumentScan[]>([]);
  const [selectedScanIds, setSelectedScanIds] = useState<number[]>([]);
  const [scanSearchQuery, setScanSearchQuery] = useState('');
  const [isLoadingScans, setIsLoadingScans] = useState<boolean>(false);

  // Candidate Ranking & Evaluation State
  const [rankedCandidates, setRankedCandidates] = useState<RankedCandidateItem[]>([]);
  const [isRanking, setIsRanking] = useState<boolean>(false);
  const [rankingStage, setRankingStage] = useState<string>('');
  const [rankingProgress, setRankingProgress] = useState<number>(0);

  // Interactive Action State
  const [actionLoadingCandidateId, setActionLoadingCandidateId] = useState<string | number | null>(null);

  // Feedback Messages
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 1. Fetch Project Details & Allocated Resources
  useEffect(() => {
    if (parsedProjectId && !isNaN(parsedProjectId)) {
      fetchProjectData(parsedProjectId);
      fetchTenantScans();
    }
  }, [parsedProjectId]);

  const fetchProjectData = async (id: number) => {
    setIsLoadingProject(true);
    setErrorMessage(null);
    try {
      const data = await api.getProject(id);
      setProject(data);

      // Fetch allocated resources
      const allocRes = await api.getProjectAllocatedResources(id);
      setAllocatedResources(allocRes.allocated_resources || []);
    } catch (err: any) {
      console.error('Failed to load project details', err);
      setErrorMessage(err.response?.data?.detail || 'Project not found or failed to load.');
    } finally {
      setIsLoadingProject(false);
    }
  };

  const fetchTenantScans = async () => {
    setIsLoadingScans(true);
    try {
      const res = await api.getCompanyScans(100, 0);
      const scanList: DocumentScan[] = res.scans || [];
      setScans(scanList);
      // Default to selecting all candidate scans
      setSelectedScanIds(scanList.map((s: DocumentScan) => s.id));
    } catch (err) {
      console.warn('Could not fetch candidate scans:', err);
    } finally {
      setIsLoadingScans(false);
    }
  };

  // Filter candidate scans
  const filteredScans = useMemo(() => {
    if (!scanSearchQuery.trim()) return scans;
    const q = scanSearchQuery.toLowerCase();
    return scans.filter(
      (s) =>
        s.filename.toLowerCase().includes(q) ||
        (s.extracted_json?.['Candidate Name'] || '').toLowerCase().includes(q) ||
        (s.extracted_json?.['Email'] || '').toLowerCase().includes(q)
    );
  }, [scans, scanSearchQuery]);

  // Handle Scan Selection
  const toggleScanSelection = (scanId: number) => {
    setSelectedScanIds((prev) =>
      prev.includes(scanId) ? prev.filter((id) => id !== scanId) : [...prev, scanId]
    );
  };

  const selectAllScans = () => {
    setSelectedScanIds(scans.map((s) => s.id));
  };

  const clearScanSelection = () => {
    setSelectedScanIds([]);
  };

  // Run AI Candidate Evaluation & Ranking
  const handleRunCandidateRanking = async () => {
    if (!project) return;
    if (selectedScanIds.length === 0) {
      setErrorMessage('Please select at least 1 candidate document scan to evaluate.');
      return;
    }

    setIsRanking(true);
    setRankingProgress(15);
    setRankingStage('1/3: Vectorizing Project Requirements & Experience Thresholds...');
    setErrorMessage(null);

    try {
      setTimeout(() => {
        setRankingProgress(45);
        setRankingStage('2/3: Scanning tenant candidates from Document OCR database...');
      }, 700);

      setTimeout(() => {
        setRankingProgress(80);
        setRankingStage('3/3: Synthesizing Explainable AI Matching Evidence & Fit Breakdown...');
      }, 1500);

      const res = await api.rankCandidatesForProject(project.id, selectedScanIds);
      const candidates = (res.ranked_candidates || []) as RankedCandidateItem[];
      setRankedCandidates(candidates);

      setRankingProgress(100);
      setSuccessMessage(
        `Successfully evaluated ${candidates.length} candidate(s) against project ${project.project_code}!`
      );
    } catch (err: any) {
      console.error('Candidate ranking failed', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to rank candidates for this project.');
    } finally {
      setIsRanking(false);
    }
  };

  // Handle Candidate Allocation
  const handleAllocateCandidate = async (candidate: RankedCandidateItem) => {
    if (!project) return;
    setActionLoadingCandidateId(candidate.candidate_id);
    setErrorMessage(null);

    try {
      const res = await api.updateCandidateAllocationStatus(
        project.id,
        candidate.candidate_id,
        'ALLOCATED',
        'Allocated via AI Project Allotment Engine'
      );

      // Update ranked roster
      setRankedCandidates((prev) =>
        prev.map((c) =>
          c.candidate_id === candidate.candidate_id
            ? { ...c, status: 'ALLOCATED', allocated_at: res.allocated_at || new Date().toISOString() }
            : c
        )
      );

      setSuccessMessage(`Candidate '${candidate.candidate_name}' successfully allocated to ${project.project_name}!`);

      // Refresh project and allocations
      await fetchProjectData(project.id);
    } catch (err: any) {
      console.error('Allocation error', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to allocate candidate to project.');
    } finally {
      setActionLoadingCandidateId(null);
    }
  };

  // Handle Candidate Rejection / Pass
  const handleRejectCandidate = async (candidate: RankedCandidateItem) => {
    if (!project) return;
    setActionLoadingCandidateId(candidate.candidate_id);
    setErrorMessage(null);

    try {
      await api.updateCandidateAllocationStatus(
        project.id,
        candidate.candidate_id,
        'REJECTED',
        'Rejected via Project Allotment Engine'
      );

      setRankedCandidates((prev) =>
        prev.map((c) =>
          c.candidate_id === candidate.candidate_id ? { ...c, status: 'REJECTED', allocated_at: null } : c
        )
      );

      setSuccessMessage(`Candidate '${candidate.candidate_name}' set to REJECTED.`);
      await fetchProjectData(project.id);
    } catch (err: any) {
      console.error('Rejection error', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to update candidate status.');
    } finally {
      setActionLoadingCandidateId(null);
    }
  };

  // Handle Deallocation from Active Team Grid
  const handleDeallocateCandidate = async (candidateId: string | number) => {
    if (!project) return;
    setActionLoadingCandidateId(candidateId);
    setErrorMessage(null);

    try {
      await api.updateCandidateAllocationStatus(
        project.id,
        candidateId,
        'PENDING',
        'Deallocated from project team'
      );

      // Update ranked roster
      setRankedCandidates((prev) =>
        prev.map((c) =>
          String(c.candidate_id) === String(candidateId)
            ? { ...c, status: 'PENDING', allocated_at: null }
            : c
        )
      );

      setSuccessMessage('Resource released from project and status set back to PENDING.');
      await fetchProjectData(project.id);
    } catch (err: any) {
      console.error('Deallocation error', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to release resource.');
    } finally {
      setActionLoadingCandidateId(null);
    }
  };

  // Handle Navigating to Dedicated Full-Screen Candidate Profile Page
  const handleNavigateToCandidateProfile = (candidateOrAllocation: any) => {
    if (!project) return;
    let cId: string | number | undefined;
    if (typeof candidateOrAllocation === 'string' || typeof candidateOrAllocation === 'number') {
      cId = candidateOrAllocation;
    } else if (candidateOrAllocation) {
      cId = candidateOrAllocation.candidate_id || candidateOrAllocation.id;
    }
    if (cId) {
      navigate(`/hr/projects/${project.id}/candidate/${cId}`);
    }
  };

  if (isLoadingProject) {
    return (
      <div className="p-16 text-center">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs font-semibold text-slate-600">Loading project detail dashboard...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-12 text-center max-w-lg mx-auto space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Project Not Found</h3>
        <p className="text-xs text-slate-500">
          The requested project specification (ID: {projectId}) could not be retrieved.
        </p>
        <button
          onClick={() => navigate('/hr/projects')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Projects Master List</span>
        </button>
      </div>
    );
  }

  const teamCapacity = project.team_capacity || 1;
  const allocatedCount = allocatedResources.length;
  const capacityPct = Math.min(100, Math.round((allocatedCount / teamCapacity) * 100));
  const isTeamFull = allocatedCount >= teamCapacity;
  const reqs = project.extracted_requirements || {};
  const skills = project.required_skills || reqs.skills || [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* TOP NAVIGATION & BREADCRUMB */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Link
            to="/hr/projects"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
            <span>Projects Master</span>
          </Link>
          <span className="text-slate-300">/</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-bold flex items-center gap-1">
              <Hash className="w-3 h-3 text-indigo-500" />
              {project.project_code}
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isTeamFull
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : allocatedCount > 0
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              {isTeamFull ? 'Fully Staffed' : `${allocatedCount}/${teamCapacity} Staffed`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.01, y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={() => setShowProjectSpec(!showProjectSpec)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors shadow-sm cursor-pointer transform-gpu will-change-transform"
          >
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>{showProjectSpec ? 'Hide Project Spec' : 'View Project Spec'}</span>
            {showProjectSpec ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={() => fetchProjectData(project.id)}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer transform-gpu will-change-transform"
            title="Refresh Project Data"
          >
            <RefreshCw className="w-4 h-4" />
          </motion.button>
        </div>
      </div>

      {/* FEEDBACK BANNERS */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* PROJECT HEADER CARD */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 flex-shrink-0">
                <FolderKanban className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">{project.project_name}</h1>
                <p className="text-xs text-slate-500">
                  Targeted resource allotment and candidate verification engine for this enterprise initiative.
                </p>
              </div>
            </div>

            {/* Quick Skills Pill Badges */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">Target Skills:</span>
              {skills.map((s, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md bg-indigo-50/70 border border-indigo-100 text-indigo-700 text-xs font-medium"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Allocation Capacity Gauge Card */}
          <div className="w-full lg:w-72 bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-center">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                <span>Team Capacity</span>
              </span>
              <span className="font-mono text-xs font-bold text-slate-900">
                {allocatedCount} / {teamCapacity} ({capacityPct}%)
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isTeamFull
                    ? 'bg-emerald-500'
                    : allocatedCount > 0
                    ? 'bg-gradient-to-r from-indigo-500 to-emerald-500'
                    : 'bg-slate-300'
                }`}
                style={{ width: `${capacityPct}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 text-right mt-1 font-mono">
              {teamCapacity - allocatedCount > 0
                ? `${teamCapacity - allocatedCount} slot(s) remaining`
                : 'Full capacity reached'}
            </div>
          </div>
        </div>

        {/* Collapsible Project Spec Panel */}
        {showProjectSpec && (
          <div className="mt-5 pt-5 border-t border-slate-100 space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-500 uppercase text-[10px] font-bold">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Experience Required</span>
                </div>
                <div className="text-xs font-bold text-slate-900 mt-1">
                  {project.experience_requirements || '2+ years professional experience'}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-500 uppercase text-[10px] font-bold">
                  <GraduationCap className="w-3.5 h-3.5 text-blue-500" />
                  <span>Education Required</span>
                </div>
                <div className="text-xs font-bold text-slate-900 mt-1">
                  {Array.isArray(project.education_requirements)
                    ? project.education_requirements.join(', ')
                    : project.education_requirements || 'Relevant Technical Degree'}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-1.5 text-slate-500 uppercase text-[10px] font-bold">
                  <Layers className="w-3.5 h-3.5 text-purple-500" />
                  <span>Target Competencies</span>
                </div>
                <div className="text-xs font-bold text-slate-900 mt-1">{skills.length} Required Skills</div>
              </div>
            </div>

            {project.raw_project_spec && (
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Raw Project Specification Text</div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs font-mono max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {project.raw_project_spec}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SEGMENTED TAB NAVIGATION WITH iOS-STYLE GLIDING INDICATOR */}
      <div className="border-b border-slate-200">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setActiveTab('team')}
            className={`pb-3 text-xs font-bold transition-colors relative cursor-pointer flex items-center gap-2 ${
              activeTab === 'team' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Active Team Members</span>
            <span
              className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                activeTab === 'team'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {allocatedCount} / {teamCapacity}
            </span>
            {activeTab === 'team' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('scan')}
            className={`pb-3 text-xs font-bold transition-colors relative cursor-pointer flex items-center gap-2 ${
              activeTab === 'scan' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Candidate Evaluation & Scanning</span>
            <span
              className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                activeTab === 'scan'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {scans.length} Candidates
            </span>
            {activeTab === 'scan' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t-full" />
            )}
          </button>
        </div>
      </div>

      {/* TAB CONTENT WITH SMOOTH iOS FADE & GLIDE */}
      <AnimatePresence mode="wait">
        {activeTab === 'team' ? (
          <motion.div
            key="team"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4 transform-gpu will-change-transform"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Current Project Team Roster</h3>
                <p className="text-xs text-slate-500">
                  Click any candidate card to view their full verified profile, extracted skills, and proof.
                </p>
              </div>
              {allocatedCount < teamCapacity && (
                <motion.button
                  whileHover={{ scale: 1.01, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  onClick={() => setActiveTab('scan')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm transform-gpu will-change-transform"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Evaluate Candidates to Fill Slots</span>
                </motion.button>
              )}
            </div>

            <AllocatedResourcesGrid
              allocatedResources={allocatedResources}
              teamCapacity={teamCapacity}
              onDeallocate={handleDeallocateCandidate}
              onSelectCandidate={handleNavigateToCandidateProfile}
              isLoading={actionLoadingCandidateId !== null}
            />
          </motion.div>
        ) : (
          <motion.div
            key="scan"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-6 transform-gpu will-change-transform"
          >
          {/* Candidate Document Selection Roster */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Candidate Document OCR Pool</h3>
                <p className="text-xs text-slate-500">
                  Select tenant candidates to evaluate and rank against {project.project_name} requirements.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  type="button"
                  onClick={selectAllScans}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transform-gpu will-change-transform"
                >
                  Select All
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  type="button"
                  onClick={clearScanSelection}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transform-gpu will-change-transform"
                >
                  Clear Selection
                </motion.button>
              </div>
            </div>

            {/* Scan Search and Action Trigger */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={scanSearchQuery}
                  onChange={(e) => setScanSearchQuery(e.target.value)}
                  placeholder="Filter candidate resumes by name or filename..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.01, y: -1 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                type="button"
                onClick={handleRunCandidateRanking}
                disabled={isRanking || selectedScanIds.length === 0}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 disabled:opacity-50 transition-colors cursor-pointer transform-gpu will-change-transform"
              >
                {isRanking ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Analyzing Candidates...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Analyze & Rank Candidates ({selectedScanIds.length} Selected)</span>
                  </>
                )}
              </motion.button>
            </div>

            {/* Ranking Progress Banner */}
            {isRanking && (
              <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-indigo-900">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
                    <span>{rankingStage}</span>
                  </span>
                  <span>{rankingProgress}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-indigo-200 overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                    style={{ width: `${rankingProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Scans Grid / Chips */}
            {isLoadingScans ? (
              <div className="p-6 text-center text-xs text-slate-500">Loading candidate documents...</div>
            ) : filteredScans.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">No candidate documents found.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto p-1">
                {filteredScans.map((scan) => {
                  const isSelected = selectedScanIds.includes(scan.id);
                  const candidateName = scan.extracted_json?.['Candidate Name'] || scan.filename;
                  const email = scan.extracted_json?.['Email'] || '';

                  return (
                    <div
                      key={scan.id}
                      onClick={() => toggleScanSelection(scan.id)}
                      className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'border-indigo-300 bg-indigo-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">{candidateName}</div>
                          <div className="text-[10px] text-slate-500 truncate">{email || scan.filename}</div>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded">
                        #{scan.id}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Candidate Ranking Results Table */}
          {rankedCandidates.length > 0 && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Ranked Candidate Roster</h3>
                  <p className="text-xs text-slate-500">
                    Click any candidate row to view full Explainable AI match breakdown, or use action buttons to allocate.
                  </p>
                </div>
              </div>

              <CandidateRankingTable
                candidates={rankedCandidates}
                onSelectCandidate={(c) => navigate(`/hr/projects/${project.id}/candidate/${c.candidate_id}`)}
                onAllocateCandidate={handleAllocateCandidate}
                onRejectCandidate={handleRejectCandidate}
                actionLoadingCandidateId={actionLoadingCandidateId}
              />
            </div>
          )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
