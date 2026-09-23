import React, { useEffect } from 'react';
import {
  X,
  Mail,
  FileText,
  Sparkles,
  Award,
  Calendar,
  Layers,
  CheckCircle2,
  XCircle,
  UserCheck,
  UserX,
} from 'lucide-react';
import { MatchScore } from './MatchScore';
import { RequirementMatch } from './RequirementMatch';

interface CandidateDetailDrawerProps {
  candidate: {
    candidate_id: string | number;
    candidate_name: string;
    candidate_filename: string;
    candidate_email: string;
    score: number;
    rank: number;
    match_status: string;
    status?: 'ALLOCATED' | 'REJECTED' | 'ON_HOLD' | 'PENDING';
    project_id?: number;
    allocated_at?: string | null;
    score_breakdown: {
      skills: number;
      experience: number;
      education: number;
      certifications: number;
    };
    matched_requirements: Array<{
      category: string;
      requirement: string;
      evidence: string;
    }>;
    missing_requirements: Array<{
      category: string;
      requirement: string;
      reason: string;
    }>;
    recommendation: string;
    extracted_skills: string[];
    uploaded_at?: string;
  } | null;
  targetJobTitle?: string;
  targetProjectName?: string;
  isOpen: boolean;
  onClose: () => void;
  onAllocate?: (candidate: any) => void;
  onReject?: (candidate: any) => void;
}

export const CandidateDetailDrawer: React.FC<CandidateDetailDrawerProps> = ({
  candidate,
  targetJobTitle,
  targetProjectName,
  isOpen,
  onClose,
  onAllocate,
  onReject,
}) => {
  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !candidate) return null;

  const displayTarget = targetProjectName || targetJobTitle || 'Target Enterprise Project';
  const isAllocated = candidate.status === 'ALLOCATED';
  const isRejected = candidate.status === 'REJECTED';

  const getRankBadge = (rank: number) => {
    if (rank === 1) return 'bg-amber-100 text-amber-800 border-amber-300';
    if (rank === 2) return 'bg-slate-100 text-slate-700 border-slate-300';
    if (rank === 3) return 'bg-amber-50 text-amber-800 border-amber-300';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Container */}
      <div className="relative w-full max-w-2xl bg-white border-l border-slate-200 text-slate-900 h-full shadow-2xl z-10 flex flex-col overflow-hidden animate-in slide-in-from-right duration-250">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${getRankBadge(
                candidate.rank
              )}`}
            >
              #{candidate.rank} RANK
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>{candidate.candidate_name}</span>
                {isAllocated && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Allocated
                  </span>
                )}
                {isRejected && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                    <XCircle className="w-3 h-3 text-rose-600" />
                    Rejected
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 flex items-center gap-2">
                <span>Target Project: {displayTarget}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <MatchScore
              score={candidate.score}
              matchStatus={candidate.match_status}
              scoreBreakdown={candidate.score_breakdown}
              size="md"
            />
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* 1. Candidate Info Card */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              <Mail className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              <span className="truncate">{candidate.candidate_email || 'No email detected'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
              <span className="truncate font-mono">{candidate.candidate_filename}</span>
            </div>
            {candidate.uploaded_at && (
              <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Uploaded {new Date(candidate.uploaded_at).toLocaleDateString()}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-slate-500 text-[11px]">
              <Layers className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
              <span>Verified via Explainable AI OCR</span>
            </div>
          </div>

          {/* 2. Executive AI Recommendation Box */}
          <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200">
            <div className="flex items-center gap-2 text-indigo-800 font-bold text-xs uppercase tracking-wider mb-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Executive Match Synthesis & Recommendation</span>
            </div>
            <p className="text-xs text-slate-800 leading-relaxed italic">
              "{candidate.recommendation}"
            </p>
          </div>

          {/* 3. Multi-Dimension Score Breakdown */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
              Project Compatibility Vectors
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-sm">
                <div className="text-[10px] text-slate-500 font-medium">Core Skills (55%)</div>
                <div className="text-base font-bold text-indigo-600 mt-1">
                  {candidate.score_breakdown.skills}%
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-sm">
                <div className="text-[10px] text-slate-500 font-medium">Experience (25%)</div>
                <div className="text-base font-bold text-blue-600 mt-1">
                  {candidate.score_breakdown.experience}%
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-sm">
                <div className="text-[10px] text-slate-500 font-medium">Education (15%)</div>
                <div className="text-base font-bold text-emerald-600 mt-1">
                  {candidate.score_breakdown.education}%
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-sm">
                <div className="text-[10px] text-slate-500 font-medium">Certifications (5%)</div>
                <div className="text-base font-bold text-amber-600 mt-1">
                  {candidate.score_breakdown.certifications}%
                </div>
              </div>
            </div>
          </div>

          {/* 4. Explainable Evidence & Gaps (Dual Column) */}
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-600" />
              <span>Evidence-Backed Verification Breakdown</span>
            </h3>
            <RequirementMatch
              matched={candidate.matched_requirements}
              missing={candidate.missing_requirements}
              compact={false}
            />
          </div>

          {/* 5. Verified Candidate Skills */}
          {candidate.extracted_skills && candidate.extracted_skills.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                All Extracted Skills from Resume
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {candidate.extracted_skills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-white border border-slate-200 text-slate-800 shadow-sm"
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer with Action Controls */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 flex-shrink-0">
          <div className="flex items-center gap-2">
            {!isAllocated ? (
              <button
                type="button"
                onClick={() => onAllocate && onAllocate(candidate)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <UserCheck className="w-4 h-4" />
                <span>Approve / Allocate to Project</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onReject && onReject(candidate)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 text-xs font-semibold transition-all cursor-pointer"
              >
                <UserX className="w-4 h-4" />
                <span>Release Resource</span>
              </button>
            )}

            {!isAllocated && !isRejected && (
              <button
                type="button"
                onClick={() => onReject && onReject(candidate)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-all cursor-pointer"
              >
                <XCircle className="w-4 h-4" />
                <span>Reject / Pass</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Close Proof
          </button>
        </div>
      </div>
    </div>
  );
};
