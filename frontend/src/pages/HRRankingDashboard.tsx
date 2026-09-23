import React, { useState, useEffect } from 'react';
import {
  FolderKanban,
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
  Layers,
} from 'lucide-react';
import { api } from '../api/client';
import type { DocumentScan, Project, CandidateAllocation } from '../api/client';
import { JDAnalysisPanel } from '../components/hr/JDAnalysisPanel';
import { AllocatedResourcesGrid } from '../components/hr/AllocatedResourcesGrid';
import {
  CandidateRankingTable,
} from '../components/hr/CandidateRankingTable';
import type { RankedCandidateItem } from '../components/hr/CandidateRankingTable';
import { CandidateDetailDrawer } from '../components/hr/CandidateDetailDrawer';

export const HRRankingDashboard: React.FC = () => {
  // 1. Projects State (Hydrated from sessionStorage)
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(() => {
    try {
      const saved = sessionStorage.getItem('docverify_hr_active_project_id');
      return saved ? Number(saved) : null;
    } catch {
      return null;
    }
  });

  const [selectedProjectDetail, setSelectedProjectDetail] = useState<Project | null>(() => {
    try {
      const saved = sessionStorage.getItem('docverify_hr_active_project_detail');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // 2. Allocated Resources State
  const [allocatedResources, setAllocatedResources] = useState<CandidateAllocation[]>([]);
  const [isLoadingAllocations, setIsLoadingAllocations] = useState(false);

  // 3. Candidate Selection State (Hydrated from sessionStorage)
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

  // 4. New Project Setup Modal State (All 5 Core Fields)
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectNameInput, setProjectNameInput] = useState('');
  const [projectCodeInput, setProjectCodeInput] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  const [experienceInput, setExperienceInput] = useState('');
  const [educationInput, setEducationInput] = useState('');
  const [capacityInput, setCapacityInput] = useState(4);
  const [projectSpecTextInput, setProjectSpecTextInput] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // 5. Candidate Ranking State (Hydrated from sessionStorage)
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
            allocated_count: 0,
            team_capacity: 4,
          };
    } catch {
      return {
        total_candidates_analyzed: 0,
        top_match_percentage: 0,
        average_match_percentage: 0,
        strong_matches_count: 0,
        allocated_count: 0,
        team_capacity: 4,
      };
    }
  });

  // 6. Action Execution State
  const [actionLoadingCandidateId, setActionLoadingCandidateId] = useState<string | number | null>(null);

  // 7. Drawer & Notifications
  const [selectedCandidate, setSelectedCandidate] = useState<RankedCandidateItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // -------------------------------------------------------------
  // STATE PERSISTENCE: Synchronize to sessionStorage
  // -------------------------------------------------------------
  useEffect(() => {
    try {
      if (selectedProjectId !== null) {
        sessionStorage.setItem('docverify_hr_active_project_id', String(selectedProjectId));
      } else {
        sessionStorage.removeItem('docverify_hr_active_project_id');
      }
    } catch (e) {
      console.warn('Failed to save active_project_id to sessionStorage', e);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    try {
      if (selectedProjectDetail) {
        sessionStorage.setItem('docverify_hr_active_project_detail', JSON.stringify(selectedProjectDetail));
      } else {
        sessionStorage.removeItem('docverify_hr_active_project_detail');
      }
    } catch (e) {
      console.warn('Failed to save active_project_detail to sessionStorage', e);
    }
  }, [selectedProjectDetail]);

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
    loadProjects();
    loadAvailableScans();
  }, []);

  const loadProjects = async () => {
    try {
      const res = await api.getProjects();
      const projectList = res.projects || res.job_descriptions || [];
      if (projectList.length > 0) {
        setProjects(projectList);
        // If nothing was hydrated from sessionStorage, default to the latest project
        if (!selectedProjectId && !selectedProjectDetail) {
          const first = projectList[0];
          setSelectedProjectId(first.id);
          fetchProjectDetail(first.id);
        } else if (selectedProjectId) {
          fetchProjectDetail(selectedProjectId);
        }
      }
    } catch (err: any) {
      console.error('Failed to load projects:', err);
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

  const fetchProjectDetail = async (projectId: number) => {
    try {
      setErrorMessage(null);
      setIsLoadingAllocations(true);
      const project = await api.getProject(projectId);
      setSelectedProjectDetail(project);

      // Fetch allocated resources list for project dashboard
      const resAlloc = await api.getProjectAllocatedResources(projectId);
      const allocList = resAlloc.allocated_resources || [];
      setAllocatedResources(allocList);

      // Update KPI metrics
      setKpis((prev: any) => ({
        ...prev,
        allocated_count: allocList.length,
        team_capacity: project.team_capacity || prev.team_capacity || 4,
      }));
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to fetch project details.');
    } finally {
      setIsLoadingAllocations(false);
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
  // CORE FEATURE 1: CREATE PROJECT WITH 5 REQUIRED FIELDS
  // -------------------------------------------------------------
  const handleCreateNewProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectNameInput.trim() && !projectSpecTextInput.trim() && !uploadedFile) {
      setErrorMessage('Please provide a Project Name or upload a project specification document.');
      return;
    }

    setIsCreatingProject(true);
    setErrorMessage(null);

    try {
      let result: Project;
      const skillsArray = skillsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (uploadedFile) {
        const formData = new FormData();
        formData.append('file', uploadedFile);
        formData.append('project_name', projectNameInput.trim() || 'Enterprise Project');
        if (projectCodeInput.trim()) formData.append('project_code', projectCodeInput.trim());
        if (skillsArray.length > 0) formData.append('required_skills', skillsArray.join(', '));
        if (experienceInput.trim()) formData.append('experience_requirements', experienceInput.trim());
        if (educationInput.trim()) formData.append('education_requirements', educationInput.trim());
        formData.append('team_capacity', String(capacityInput || 4));
        result = await api.createProject(formData);
      } else {
        result = await api.createProject({
          project_name: projectNameInput.trim() || 'Enterprise Project',
          project_code: projectCodeInput.trim() || undefined,
          required_skills: skillsArray.length > 0 ? skillsArray : undefined,
          experience_requirements: experienceInput.trim() || undefined,
          education_requirements: educationInput.trim() || undefined,
          team_capacity: capacityInput || 4,
          raw_project_spec: projectSpecTextInput.trim() || undefined,
        });
      }

      setSuccessMessage(`Project '${result.project_name}' (${result.project_code}) created & saved successfully!`);
      setShowProjectModal(false);
      setProjectNameInput('');
      setProjectCodeInput('');
      setSkillsInput('');
      setExperienceInput('');
      setEducationInput('');
      setCapacityInput(4);
      setProjectSpecTextInput('');
      setUploadedFile(null);

      // Refresh list and select new Project
      await loadProjects();
      setSelectedProjectId(result.id);
      setSelectedProjectDetail(result);
      setAllocatedResources([]);

      // Automatically evaluate candidates for the new project
      if (selectedScanIds.length > 0) {
        await runCandidateRanking(result.id, selectedScanIds);
      }
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to create project specification.');
    } finally {
      setIsCreatingProject(false);
    }
  };

  // -------------------------------------------------------------
  // CORE FEATURE 2: AI RANKING & CANDIDATE MATCHING
  // -------------------------------------------------------------
  const runCandidateRanking = async (projectId: number, targetScanIds?: number[]) => {
    const idsToRank = targetScanIds !== undefined ? targetScanIds : selectedScanIds;

    if (idsToRank.length === 0) {
      setErrorMessage('Please select at least 1 candidate document scan to evaluate.');
      return;
    }

    setIsRanking(true);
    setErrorMessage(null);

    // Progressive step indicator
    setRankingStage('1/3: Ingesting target project requirements & skills vectors...');
    const t1 = setTimeout(() => {
      setRankingStage('2/3: Scanning tenant candidates from Document OCR database...');
    }, 600);
    const t2 = setTimeout(() => {
      setRankingStage('3/3: Synthesizing Explainable AI match vectors & compatibility proofs...');
    }, 1400);

    try {
      const res = await api.rankCandidatesForProject(projectId, idsToRank);
      const candidates = (res.ranked_candidates || []) as RankedCandidateItem[];
      setRankedCandidates(candidates);
      setKpis({
        ...res.kpis,
        allocated_count: res.kpis.allocated_count || allocatedResources.length,
        team_capacity: res.kpis.team_capacity || selectedProjectDetail?.team_capacity || 4,
      });

      setSuccessMessage(
        `Successfully evaluated ${candidates.length} candidate(s) against project ${
          selectedProjectDetail?.project_name || 'spec'
        }!`
      );
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to rank candidates for this project.');
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setIsRanking(false);
      setRankingStage('');
    }
  };

  // -------------------------------------------------------------
  // CORE FEATURE 3: SELECTION, ALLOTMENT & ACTION WORKFLOW
  // -------------------------------------------------------------
  const handleAllocateCandidate = async (candidate: RankedCandidateItem) => {
    if (!selectedProjectId) return;

    setActionLoadingCandidateId(candidate.candidate_id);
    setErrorMessage(null);

    try {
      const res = await api.updateCandidateAllocationStatus(
        selectedProjectId,
        candidate.candidate_id,
        'ALLOCATED',
        `Approved by HR Manager for ${selectedProjectDetail?.project_name || 'Project'}`
      );

      // Optimistic update of rankedCandidates roster
      setRankedCandidates((prev) =>
        prev.map((c) =>
          c.candidate_id === candidate.candidate_id
            ? { ...c, status: 'ALLOCATED', allocated_at: res.allocated_at || new Date().toISOString() }
            : c
        )
      );

      // Update drawer candidate if open
      if (selectedCandidate && selectedCandidate.candidate_id === candidate.candidate_id) {
        setSelectedCandidate((prev) =>
          prev ? { ...prev, status: 'ALLOCATED', allocated_at: res.allocated_at || new Date().toISOString() } : null
        );
      }

      // Refresh allocated resources
      await fetchProjectDetail(selectedProjectId);

      setSuccessMessage(`Candidate '${candidate.candidate_name}' successfully allocated to ${selectedProjectDetail?.project_name || 'project'}!`);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to allocate candidate to project.');
    } finally {
      setActionLoadingCandidateId(null);
    }
  };

  const handleRejectCandidate = async (candidate: RankedCandidateItem) => {
    if (!selectedProjectId) return;

    setActionLoadingCandidateId(candidate.candidate_id);
    setErrorMessage(null);

    try {
      await api.updateCandidateAllocationStatus(
        selectedProjectId,
        candidate.candidate_id,
        'REJECTED',
        'Profile rejected / passed for this project'
      );

      // Optimistic update
      setRankedCandidates((prev) =>
        prev.map((c) =>
          c.candidate_id === candidate.candidate_id ? { ...c, status: 'REJECTED', allocated_at: null } : c
        )
      );

      if (selectedCandidate && selectedCandidate.candidate_id === candidate.candidate_id) {
        setSelectedCandidate((prev) => (prev ? { ...prev, status: 'REJECTED', allocated_at: null } : null));
      }

      // Refresh allocated resources
      await fetchProjectDetail(selectedProjectId);

      setSuccessMessage(`Candidate '${candidate.candidate_name}' status updated to Rejected.`);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to update candidate status.');
    } finally {
      setActionLoadingCandidateId(null);
    }
  };

  const handleDeallocateCandidate = async (candidateId: string | number) => {
    if (!selectedProjectId) return;

    setActionLoadingCandidateId(candidateId);
    setErrorMessage(null);

    try {
      await api.updateCandidateAllocationStatus(selectedProjectId, candidateId, 'PENDING');

      // Optimistic update
      setRankedCandidates((prev) =>
        prev.map((c) =>
          String(c.candidate_id) === String(candidateId) ? { ...c, status: 'PENDING', allocated_at: null } : c
        )
      );

      // Refresh allocated resources list
      await fetchProjectDetail(selectedProjectId);
      setSuccessMessage('Resource released back to unassigned candidate pool.');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.detail || 'Failed to release resource.');
    } finally {
      setActionLoadingCandidateId(null);
    }
  };

  const handleSelectCandidate = (candidate: RankedCandidateItem) => {
    setSelectedCandidate(candidate);
    setDrawerOpen(true);
  };

  const handleSelectCandidateByName = (candidate: string | CandidateAllocation) => {
    const candidateName = typeof candidate === 'string' ? candidate : candidate.candidate_name;
    const found = rankedCandidates.find(
      (c) => c.candidate_name.toLowerCase().trim() === candidateName.toLowerCase().trim()
    );
    if (found) {
      setSelectedCandidate(found);
      setDrawerOpen(true);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                AI Project Allotment Engine
              </h1>
              <p className="text-slate-500 text-xs mt-0.5">
                Allocate vetted candidates and engineering talent to active enterprise projects with Explainable AI matching.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {projects.length > 0 && (
            <div className="relative">
              <select
                value={selectedProjectId || ''}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setSelectedProjectId(id);
                  fetchProjectDetail(id);
                }}
                disabled={isRanking}
                className="pl-3 pr-8 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer disabled:opacity-50 shadow-sm"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_name} ({p.project_code || `#${p.id}`})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setShowProjectModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Project Setup / Add Project</span>
          </button>

          {selectedProjectId && (
            <button
              onClick={() => runCandidateRanking(selectedProjectId)}
              disabled={isRanking || selectedScanIds.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 shadow-sm"
              title="Rerun Project Compatibility Matching Engine"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRanking ? 'animate-spin text-indigo-500' : ''}`} />
              <span>Rerun Match</span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between shadow-sm animate-in fade-in">
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
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-sm animate-in fade-in">
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
              <div className="text-xs font-bold text-indigo-950">Running AI Project Allotment Engine...</div>
              <div className="text-xs text-indigo-700 mt-0.5 font-mono">{rankingStage}</div>
            </div>
          </div>
        </div>
      )}

      {/* CORE FEATURE 4: REAL-TIME METRICS KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Candidates Evaluated */}
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

        {/* Best Match Fit */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-slate-500 uppercase text-xs font-semibold">
                Best Match Fit
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

        {/* Total Allocated Count vs Needed Capacity */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-slate-500 uppercase text-xs font-semibold">
                Allocated Count vs Capacity
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1 flex items-baseline gap-1">
                <span>{kpis.allocated_count}</span>
                <span className="text-sm font-normal text-slate-400">/ {kpis.team_capacity} Needed</span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {kpis.allocated_count >= kpis.team_capacity ? 'Team fully staffed' : `${Math.max(0, kpis.team_capacity - kpis.allocated_count)} positions open`}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center">
              <Layers className="w-5 h-5" />
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
              <div className="text-xs text-slate-400 mt-0.5">Qualified for allocation stage</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* CORE FEATURE 1: ACTIVE PROJECT SPECIFICATION PANEL */}
      {selectedProjectDetail ? (
        <JDAnalysisPanel
          projectName={selectedProjectDetail.project_name}
          projectCode={selectedProjectDetail.project_code}
          teamCapacity={selectedProjectDetail.team_capacity}
          allocatedCount={allocatedResources.length}
          extractedRequirements={selectedProjectDetail.extracted_requirements || {}}
          rawProjectSpec={selectedProjectDetail.raw_project_spec}
          onSwitchProject={() => setShowProjectModal(true)}
        />
      ) : (
        <div className="p-8 rounded-xl border border-dashed border-slate-300 bg-white text-center shadow-sm">
          <FolderKanban className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900">No Project Specification Selected</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Create a Project with required technical skills, experience, and needed team capacity to allocate qualified candidates.
          </p>
          <button
            onClick={() => setShowProjectModal(true)}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Project Setup / Add Project</span>
          </button>
        </div>
      )}

      {/* CORE FEATURE 4: ACTIVE TEAM MEMBERS / ALLOCATED RESOURCES MONITORING */}
      {selectedProjectDetail && (
        <AllocatedResourcesGrid
          allocatedResources={allocatedResources}
          teamCapacity={selectedProjectDetail.team_capacity || 4}
          onDeallocate={handleDeallocateCandidate}
          onSelectCandidate={handleSelectCandidateByName}
          isLoading={isLoadingAllocations}
        />
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
                  Select Candidates to Evaluate for Allotment
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
            {selectedProjectId && (
              <button
                type="button"
                onClick={() => runCandidateRanking(selectedProjectId)}
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

      {/* CORE FEATURE 2 & 3: CANDIDATE RANKING ROSTER WITH ACTION WORKFLOW */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">Ranked Candidate Roster</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono border border-slate-200">
              {rankedCandidates.length} Profiles
            </span>
          </div>
          <div className="text-xs text-slate-500">
            Use the <span className="font-semibold text-emerald-600">[Allocate to Project]</span> or <span className="font-semibold text-rose-600">[Reject / Pass]</span> action buttons to manage resource allotments.
          </div>
        </div>

        <CandidateRankingTable
          candidates={rankedCandidates}
          onSelectCandidate={handleSelectCandidate}
          onAllocateCandidate={handleAllocateCandidate}
          onRejectCandidate={handleRejectCandidate}
          isLoading={isRanking}
          actionLoadingCandidateId={actionLoadingCandidateId}
        />
      </div>

      {/* Candidate Detail Slide-Over Drawer */}
      <CandidateDetailDrawer
        candidate={selectedCandidate}
        targetProjectName={selectedProjectDetail?.project_name}
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedCandidate(null);
        }}
        onAllocate={handleAllocateCandidate}
        onReject={handleRejectCandidate}
      />

      {/* CORE FEATURE 1: NEW PROJECT SETUP / ADD PROJECT MODAL */}
      {showProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => !isCreatingProject && setShowProjectModal(false)}
          />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white border border-slate-200 p-6 shadow-2xl z-10 text-slate-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md">
                  <FolderKanban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">New Project Setup / Add Project</h3>
                  <p className="text-xs text-slate-500">Configure project requirements, needed skills, and team capacity</p>
                </div>
              </div>
              <button
                onClick={() => !isCreatingProject && setShowProjectModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateNewProject} className="space-y-4">
              {/* Field 1 & 2: Project Name and Project Code */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    1. Project Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Vision AI Document Intelligence Engine"
                    value={projectNameInput}
                    onChange={(e) => setProjectNameInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    2. Project Code / ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. PRJ-VISION-01"
                    value={projectCodeInput}
                    onChange={(e) => setProjectCodeInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
              </div>

              {/* Field 3: Required Technical & Domain Skills */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  3. Required Technical & Domain Skills (Comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Python, FastAPI, Vision LLMs, RAG, Docker"
                  value={skillsInput}
                  onChange={(e) => setSkillsInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  AI will also analyze and augment this list with skills extracted from the project description.
                </span>
              </div>

              {/* Field 4 & 5: Experience, Education, and Team Capacity */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    4a. Experience Req.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 3+ years in AI systems"
                    value={experienceInput}
                    onChange={(e) => setExperienceInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    4b. Education Req.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. B.S. or M.S. in CS"
                    value={educationInput}
                    onChange={(e) => setEducationInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    5. Team Capacity (Count)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={capacityInput}
                    onChange={(e) => setCapacityInput(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
              </div>

              {/* Project Specification / Requirements Text */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Description & Specifications
                </label>
                <textarea
                  rows={5}
                  placeholder="Describe project objectives, system architecture, core deliverables, and technical expectations..."
                  value={projectSpecTextInput}
                  onChange={(e) => setProjectSpecTextInput(e.target.value)}
                  className="w-full p-3 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 placeholder:text-slate-400 font-sans focus:outline-none focus:ring-2 focus:ring-indigo-500/50 leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-[10px] text-slate-500 uppercase font-semibold">OR Upload Spec Document</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Upload Project Specification File (.pdf, .docx, .txt)
                </label>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setUploadedFile(e.target.files[0]);
                    }
                  }}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
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
                  onClick={() => setShowProjectModal(false)}
                  disabled={isCreatingProject}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingProject}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isCreatingProject ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span>Synthesizing Requirements via AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Create & Launch Project Allotment</span>
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
