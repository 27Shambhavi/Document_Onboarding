import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderKanban,
  Users,
  Award,
  TrendingUp,
  Sparkles,
  Plus,
  Search,
  Trash2,
  ExternalLink,
  Clock,
  GraduationCap,
  AlertCircle,
  CheckCircle2,
  X,
  Upload,
} from 'lucide-react';
import { api } from '../api/client';
import type { Project } from '../api/client';
import { PageHeaderActions } from '../components/PageHeaderActions';

export const ProjectsMasterList: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal: New Project Setup
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectNameInput, setProjectNameInput] = useState('');
  const [projectCodeInput, setProjectCodeInput] = useState('');
  const [requiredSkillsInput, setRequiredSkillsInput] = useState('');
  const [experienceInput, setExperienceInput] = useState('');
  const [educationInput, setEducationInput] = useState('');
  const [teamCapacityInput, setTeamCapacityInput] = useState<number>(3);
  const [rawSpecInput, setRawSpecInput] = useState('');
  const [projectFile, setProjectFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Modal: Delete Confirmation
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch Projects on mount
  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.getProjects();
      const list = res.projects || [];
      setProjects(list);
    } catch (err: any) {
      console.error('Failed to load projects', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to load projects. Please refresh.');
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered Projects
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const query = searchQuery.toLowerCase();
    return projects.filter((p) => {
      const nameMatch = p.project_name.toLowerCase().includes(query);
      const codeMatch = p.project_code.toLowerCase().includes(query);
      const skillMatch = (p.required_skills || []).some((s) => s.toLowerCase().includes(query));
      return nameMatch || codeMatch || skillMatch;
    });
  }, [projects, searchQuery]);

  // Aggregate Portfolio Metrics
  const metrics = useMemo(() => {
    const totalProjects = projects.length;
    const totalCapacity = projects.reduce((acc, p) => acc + (p.team_capacity || 1), 0);
    const totalAllocated = projects.reduce((acc, p) => acc + (p.allocated_count || 0), 0);
    const allocationRate = totalCapacity > 0 ? Math.round((totalAllocated / totalCapacity) * 100) : 0;
    return {
      totalProjects,
      totalCapacity,
      totalAllocated,
      allocationRate,
    };
  }, [projects]);

  // Handle Project Creation
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectNameInput.trim()) {
      setErrorMessage('Project Name is required.');
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);

    try {
      const skillsArray = requiredSkillsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      let payload: any;
      if (projectFile) {
        const formData = new FormData();
        formData.append('file', projectFile);
        formData.append('project_name', projectNameInput.trim());
        if (projectCodeInput.trim()) formData.append('project_code', projectCodeInput.trim());
        formData.append('required_skills', JSON.stringify(skillsArray));
        if (experienceInput.trim()) formData.append('experience_requirements', experienceInput.trim());
        if (educationInput.trim()) formData.append('education_requirements', educationInput.trim());
        formData.append('team_capacity', String(teamCapacityInput || 1));
        if (rawSpecInput.trim()) formData.append('raw_spec_text', rawSpecInput.trim());
        payload = formData;
      } else {
        payload = {
          project_name: projectNameInput.trim(),
          project_code: projectCodeInput.trim() || undefined,
          required_skills: skillsArray,
          experience_requirements: experienceInput.trim() || undefined,
          education_requirements: educationInput.trim() || undefined,
          team_capacity: Number(teamCapacityInput) || 1,
          raw_spec_text: rawSpecInput.trim() || undefined,
        };
      }

      const created = await api.createProject(payload);

      // Reset modal fields
      setProjectNameInput('');
      setProjectCodeInput('');
      setRequiredSkillsInput('');
      setExperienceInput('');
      setEducationInput('');
      setTeamCapacityInput(3);
      setRawSpecInput('');
      setProjectFile(null);
      setIsModalOpen(false);

      setSuccessMessage(`Project '${created.project_name}' created successfully!`);
      await fetchProjects();

      // Navigate to the newly created project detail view
      if (created.id) {
        navigate(`/hr/projects/${created.id}`);
      }
    } catch (err: any) {
      console.error('Project creation failed', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to create project. Please verify inputs.');
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Project Deletion
  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    try {
      const res = await api.deleteProject(projectToDelete.id);
      setSuccessMessage(res.message || `Project '${projectToDelete.project_name}' deleted successfully.`);
      setProjectToDelete(null);
      await fetchProjects();
    } catch (err: any) {
      console.error('Delete project failed', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to delete project. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* TOP HEADER ACTIONS (TELEPORTED TO MAIN TOP PAGE HEADER) */}
      <PageHeaderActions>
        <motion.button
          whileHover={{ scale: 1.01, y: -1 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 transition-all cursor-pointer transform-gpu will-change-transform"
        >
          <Plus className="w-4 h-4" />
          <span>New Project Setup / Add Project</span>
        </motion.button>
      </PageHeaderActions>

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

      {/* PORTFOLIO METRICS CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Active Projects */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Active Projects</div>
            <div className="text-xl font-bold text-slate-900 mt-0.5">{metrics.totalProjects}</div>
          </div>
        </div>

        {/* Needed Capacity */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Needed Capacity</div>
            <div className="text-xl font-bold text-slate-900 mt-0.5">{metrics.totalCapacity} Engineers</div>
          </div>
        </div>

        {/* Total Allocated */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Allocated Resources</div>
            <div className="text-xl font-bold text-slate-900 mt-0.5">{metrics.totalAllocated} Assigned</div>
          </div>
        </div>

        {/* Allocation Rate */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Allocation Rate</div>
            <div className="text-xl font-bold text-slate-900 mt-0.5">{metrics.allocationRate}% Fulfilled</div>
          </div>
        </div>
      </div>

      {/* SEARCH AND FILTER BAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects by name, code, skill..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Showing <span className="font-bold text-slate-900">{filteredProjects.length}</span> of{' '}
          <span className="font-bold text-slate-900">{projects.length}</span> enterprise projects
        </div>
      </div>

      {/* PROJECTS LIST / DATA GRID */}
      {isLoading ? (
        <div className="p-16 text-center bg-white border border-slate-200 rounded-xl">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-semibold text-slate-600">Loading project allocations portfolio...</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-xl space-y-3">
          <FolderKanban className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">
            {searchQuery ? 'No matching projects found' : 'No Enterprise Projects Found'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery
              ? 'Try modifying your search keywords or clear the filter.'
              : 'Create your first enterprise project setup to begin matching and allocating vetted candidates.'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Project</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((project) => {
            const capacity = project.team_capacity || 1;
            const allocated = project.allocated_count || 0;
            const pct = Math.min(100, Math.round((allocated / capacity) * 100));
            const isFull = allocated >= capacity;
            const skills = project.required_skills || [];

            return (
              <motion.div
                key={project.id}
                whileHover={{ scale: 1.01, y: -2 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between p-5 group transform-gpu will-change-transform"
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-bold">
                      {project.project_code || `PRJ-${project.id}`}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                        isFull
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : allocated > 0
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {isFull ? 'Fully Staffed' : allocated > 0 ? 'Partially Staffed' : 'Unstaffed'}
                    </span>
                  </div>

                  {/* Project Name */}
                  <h3
                    onClick={() => navigate(`/hr/projects/${project.id}`)}
                    className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors cursor-pointer line-clamp-1"
                    title={project.project_name}
                  >
                    {project.project_name}
                  </h3>

                  {/* Capacity Progress Bar */}
                  <div className="mt-3 bg-slate-50 border border-slate-100 p-2.5 rounded-xl">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Team Allocation</span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-900 font-bold">
                        {allocated} / {capacity} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isFull
                            ? 'bg-emerald-500'
                            : allocated > 0
                            ? 'bg-gradient-to-r from-indigo-500 to-emerald-500'
                            : 'bg-slate-300'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Required Skills Badges */}
                  <div className="mt-3.5">
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">
                      Required Skills & Domains
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {skills.length > 0 ? (
                        <>
                          {skills.slice(0, 4).map((s, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-md bg-indigo-50/70 border border-indigo-100 text-indigo-700 text-[11px] font-medium"
                            >
                              {s}
                            </span>
                          ))}
                          {skills.length > 4 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium">
                              +{skills.length - 4} more
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 italic">General domain specifications</span>
                      )}
                    </div>
                  </div>

                  {/* Experience & Education Brief */}
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5 truncate">
                      <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{project.experience_requirements || '2+ years'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <GraduationCap className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">
                        {Array.isArray(project.education_requirements)
                          ? project.education_requirements.join(', ')
                          : project.education_requirements || 'Degree in field'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions Bar */}
                <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400 font-mono">
                    Created: {project.created_at ? new Date(project.created_at).toLocaleDateString() : 'Active'}
                  </span>

                  <div className="flex items-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.92 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      onClick={() => setProjectToDelete(project)}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors cursor-pointer transform-gpu will-change-transform"
                      title="Delete Project"
                    >
                      <Trash2 className="w-4 h-4" />
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.96 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      onClick={() => navigate(`/hr/projects/${project.id}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 hover:border-indigo-600 text-xs font-bold transition-all shadow-sm cursor-pointer transform-gpu will-change-transform"
                    >
                      <span>View / Manage</span>
                      <ExternalLink className="w-3 h-3" />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* MODAL: NEW PROJECT SETUP */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto transform-gpu will-change-transform"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <FolderKanban className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">New Project Setup / Add Project</h3>
                    <p className="text-xs text-slate-500">Define requirements and needed capacity for candidate matching.</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateProject} className="space-y-4">
                {/* Field 1: Project Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    1. Project Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Autonomous Vision QA Platform"
                    value={projectNameInput}
                    onChange={(e) => setProjectNameInput(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white text-slate-900"
                  />
                </div>

                {/* Field 2: Project Code / ID */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    2. Project Code / ID <span className="text-slate-400">(Optional — Auto-generated if blank)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. PRJ-VISION-01"
                    value={projectCodeInput}
                    onChange={(e) => setProjectCodeInput(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs font-mono rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white text-slate-900"
                  />
                </div>

                {/* Field 3: Required Technical & Domain Skills */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    3. Required Technical & Domain Skills <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Python, PyTorch, Computer Vision, FastAPI, Docker, Kubernetes"
                    value={requiredSkillsInput}
                    onChange={(e) => setRequiredSkillsInput(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white text-slate-900"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Separate competencies with commas.</p>
                </div>

                {/* Field 4: Experience & Education Requirements */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      4a. Experience Requirements
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 3+ years in AI Engineering"
                      value={experienceInput}
                      onChange={(e) => setExperienceInput(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      4b. Education Requirements
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. B.Tech / M.S. in Computer Science"
                      value={educationInput}
                      onChange={(e) => setEducationInput(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white text-slate-900"
                    />
                  </div>
                </div>

                {/* Field 5: Team Capacity / Needed Allocation Count */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    5. Team Capacity / Needed Allocation Count <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={teamCapacityInput}
                    onChange={(e) => setTeamCapacityInput(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white text-slate-900 font-bold"
                  />
                </div>

                {/* Optional: Raw Spec or File */}
                <div className="pt-2 border-t border-slate-100">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Optional: Project Specification Document or Text
                  </label>
                  <div className="space-y-2">
                    <textarea
                      rows={3}
                      placeholder="Paste detailed project architecture, objectives, or deliverable requirements..."
                      value={rawSpecInput}
                      onChange={(e) => setRawSpecInput(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white text-slate-900 font-mono"
                    />
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer shadow-sm">
                        <Upload className="w-3.5 h-3.5 text-slate-500" />
                        <span>{projectFile ? projectFile.name : 'Upload Spec File (.pdf, .docx, .txt)'}</span>
                        <input
                          type="file"
                          accept=".pdf,.docx,.txt"
                          className="hidden"
                          onChange={(e) => setProjectFile(e.target.files?.[0] || null)}
                        />
                      </label>
                      {projectFile && (
                        <button
                          type="button"
                          onClick={() => setProjectFile(null)}
                          className="text-xs text-rose-600 hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transform-gpu will-change-transform"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    type="submit"
                    disabled={isCreating}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/20 disabled:opacity-50 cursor-pointer transform-gpu will-change-transform"
                  >
                    {isCreating ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Creating Project...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Setup & Analyze Project</span>
                      </>
                    )}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL: DELETE CONFIRMATION */}
      <AnimatePresence>
        {projectToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 transform-gpu will-change-transform"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mx-auto">
                <Trash2 className="w-6 h-6" />
              </div>

              <div className="text-center space-y-1.5">
                <h3 className="text-base font-bold text-slate-900">Delete Project Specification?</h3>
                <p className="text-xs text-slate-500">
                  Are you sure you want to delete <span className="font-bold text-slate-800">"{projectToDelete.project_name}"</span> (
                  <span className="font-mono text-slate-700">{projectToDelete.project_code}</span>)?
                </p>
                <p className="text-[11px] text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-100 mt-2">
                  This will deallocate all assigned team members and reset their status to PENDING so they can be reassigned to other projects.
                </p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <motion.button
                  whileHover={{ scale: 1.01, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  type="button"
                  onClick={() => setProjectToDelete(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transform-gpu will-change-transform"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.01, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-500/20 disabled:opacity-50 cursor-pointer transform-gpu will-change-transform"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Confirm Delete</span>
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
