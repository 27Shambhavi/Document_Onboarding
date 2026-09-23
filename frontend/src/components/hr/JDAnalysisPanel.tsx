import React, { useState } from 'react';
import {
  FolderKanban,
  GraduationCap,
  Clock,
  CheckCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  Users,
  Hash,
} from 'lucide-react';

interface ProjectAnalysisPanelProps {
  jobTitle?: string;
  projectName?: string;
  projectCode?: string;
  teamCapacity?: number;
  allocatedCount?: number;
  extractedRequirements: {
    job_title?: string;
    project_name?: string;
    project_code?: string;
    skills?: string[];
    experience_years?: string | number;
    education?: string[] | string;
    certifications?: string[];
    key_responsibilities?: string[];
    team_capacity?: number;
    [key: string]: any;
  };
  rawJdText?: string;
  rawProjectSpec?: string;
  onReanalyze?: () => void;
  onSwitchProject?: () => void;
}

export const JDAnalysisPanel: React.FC<ProjectAnalysisPanelProps> = ({
  jobTitle,
  projectName,
  projectCode,
  teamCapacity,
  allocatedCount = 0,
  extractedRequirements,
  rawJdText,
  rawProjectSpec,
  onReanalyze,
  onSwitchProject,
}) => {
  const [showRawText, setShowRawText] = useState(false);

  const displayTitle = projectName || jobTitle || extractedRequirements.project_name || extractedRequirements.job_title || 'Active Project Specification';
  const displayCode = projectCode || extractedRequirements.project_code || 'PRJ-SPEC-01';
  const displayCapacity = teamCapacity || extractedRequirements.team_capacity || 1;
  const rawTextContent = rawProjectSpec || rawJdText || '';

  const skills = extractedRequirements.skills || [];
  const educationRaw = extractedRequirements.education || [];
  const education = Array.isArray(educationRaw) ? educationRaw : [educationRaw].filter(Boolean);
  const responsibilities = extractedRequirements.key_responsibilities || [];
  const experienceYears = extractedRequirements.experience_years || '2+ years';

  const switchAction = onSwitchProject || onReanalyze;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mb-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-500/20">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg text-slate-900 font-bold tracking-tight">{displayTitle}</h2>
              <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-bold flex items-center gap-1">
                <Hash className="w-3 h-3 text-indigo-500" />
                {displayCode}
              </span>
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                <Sparkles className="w-3 h-3" />
                AI Verified Requirements
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Criteria extracted and utilized by the AI Project Allotment Engine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {rawTextContent && (
            <button
              onClick={() => setShowRawText(!showRawText)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors shadow-sm cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>{showRawText ? 'Hide Project Spec' : 'View Project Spec'}</span>
              {showRawText ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          {switchAction && (
            <button
              onClick={switchAction}
              className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              Switch Project
            </button>
          )}
        </div>
      </div>

      {/* Structured Requirements Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {/* Team Capacity Chip */}
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2.5">
          <Users className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-slate-500 uppercase text-xs font-semibold tracking-wider">Team Capacity</div>
            <div className="text-xs font-bold text-slate-900 mt-0.5">
              {allocatedCount} / {displayCapacity} Allocated
            </div>
          </div>
        </div>

        {/* Experience Chip */}
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-slate-500 uppercase text-xs font-semibold tracking-wider">Experience</div>
            <div className="text-xs font-bold text-slate-900 mt-0.5">{String(experienceYears)}</div>
          </div>
        </div>

        {/* Education Chip */}
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2.5">
          <GraduationCap className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-slate-500 uppercase text-xs font-semibold tracking-wider">Education</div>
            <div className="text-xs font-bold text-slate-900 mt-0.5 truncate max-w-[170px]" title={education.join(', ')}>
              {education.length > 0 ? education.join(', ') : 'Relevant Degree / Open'}
            </div>
          </div>
        </div>

        {/* Required Skills Count */}
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2.5">
          <Layers className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-slate-500 uppercase text-xs font-semibold tracking-wider">Skills Target</div>
            <div className="text-xs font-bold text-slate-900 mt-0.5">{skills.length} Key Competencies</div>
          </div>
        </div>
      </div>

      {/* Core Technical & Domain Skills */}
      <div className="mb-4">
        <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
          <span>Required Technical & Domain Skills</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-mono border border-indigo-200">
            {skills.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {skills.map((skill, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 border border-slate-200 text-slate-800 shadow-sm"
            >
              <CheckCircle className="w-3 h-3 text-indigo-600" />
              {skill}
            </span>
          ))}
        </div>
      </div>

      {/* Key Project Responsibilities */}
      {responsibilities.length > 0 && (
        <div className="pt-3 border-t border-slate-200">
          <div className="text-xs font-semibold text-slate-700 mb-2">Key Project Deliverables & Responsibilities</div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs text-slate-600">
            {responsibilities.map((resp, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-indigo-600 mt-1">•</span>
                <span>{resp}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Raw Source Text Accordion */}
      {showRawText && rawTextContent && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="text-xs font-semibold text-slate-700 mb-2">Project Specification Source</div>
          <pre className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-800 font-mono whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed">
            {rawTextContent}
          </pre>
        </div>
      )}
    </div>
  );
};
