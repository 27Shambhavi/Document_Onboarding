import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Mail,
  FileText,
  Calendar,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  UserX,
  UserMinus,
  Download,
  AlertCircle,
  Hash,
  FolderKanban,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../api/client';

export const CandidateProfilePage: React.FC = () => {
  const { projectId, candidateId } = useParams<{ projectId: string; candidateId: string }>();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (projectId && candidateId) {
      loadProfile(Number(projectId), candidateId);
    }
  }, [projectId, candidateId]);

  const loadProfile = async (pId: number, cId: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await api.getCandidateProjectProfile(pId, cId);
      setProfile(data);
    } catch (err: any) {
      console.error('Failed to load candidate profile', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to load candidate profile.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (newStatus: 'ALLOCATED' | 'REJECTED' | 'PENDING') => {
    if (!projectId || !candidateId) return;
    setIsActionLoading(true);
    setErrorMessage(null);

    try {
      const res = await api.updateCandidateAllocationStatus(
        Number(projectId),
        candidateId,
        newStatus,
        `Updated status to ${newStatus} from Candidate Profile page.`
      );

      setProfile((prev: any) => ({
        ...prev,
        status: newStatus,
        allocation_status: newStatus,
        allocated_at: res.allocated_at || (newStatus === 'ALLOCATED' ? new Date().toISOString() : null),
      }));

      setSuccessMessage(
        newStatus === 'ALLOCATED'
          ? `Candidate successfully allocated to project!`
          : newStatus === 'REJECTED'
          ? `Candidate marked as Rejected.`
          : `Candidate released back to unassigned pool.`
      );
    } catch (err: any) {
      console.error('Status update failed', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to update candidate allocation status.');
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-16 text-center">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs font-semibold text-slate-600">Loading candidate full-screen profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-12 text-center max-w-lg mx-auto space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900">Candidate Profile Not Found</h3>
        <p className="text-xs text-slate-500">
          The candidate record for ID {candidateId} in Project {projectId} could not be retrieved.
        </p>
        <button
          onClick={() => navigate(`/hr/projects/${projectId}`)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Project Roster</span>
        </button>
      </div>
    );
  }

  // DYNAMIC STATUS RESOLUTION
  const resolveCandidateStatus = (p: any): 'ALLOCATED' | 'REJECTED' | 'PENDING' => {
    if (!p) return 'PENDING';
    const raw =
      p.allocation_status ||
      p.candidate_status ||
      (p.status && p.status !== 'success' ? p.status : undefined);
    
    if (raw === 'ALLOCATED') return 'ALLOCATED';
    if (raw === 'REJECTED') return 'REJECTED';
    return 'PENDING';
  };

  const status = resolveCandidateStatus(profile);
  const score = profile.score || 0;
  const breakdown = profile.score_breakdown || { skills: 0, experience: 0, education: 0, certifications: 0 };
  const matchedReqs = profile.matched_requirements || [];
  const missingReqs = profile.missing_requirements || [];
  const skills = profile.extracted_skills || [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 1. TOP BREADCRUMB & BACK BUTTON */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <Link
          to={`/hr/projects/${projectId}`}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-sm transition-all hover:-translate-x-0.5"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
          <span>Back to Project Roster</span>
        </Link>

        {/* Quick Top Action Buttons */}
        <div className="flex items-center gap-2">
          {status === 'ALLOCATED' ? (
            <button
              onClick={() => handleUpdateStatus('PENDING')}
              disabled={isActionLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <UserMinus className="w-4 h-4" />
              <span>Release / Remove Resource</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => handleUpdateStatus('ALLOCATED')}
                disabled={isActionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <UserCheck className="w-4 h-4" />
                <span>Approve / Allocate to Project</span>
              </button>

              {status !== 'REJECTED' && (
                <button
                  onClick={() => handleUpdateStatus('REJECTED')}
                  disabled={isActionLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>Reject / Pass</span>
                </button>
              )}
            </>
          )}
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
            <XCircle className="w-4 h-4" />
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
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. PROMINENT HEADER CARD */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-blue-500 text-white font-bold text-2xl flex items-center justify-center shadow-lg shadow-indigo-500/25 flex-shrink-0">
              {profile.candidate_name ? profile.candidate_name.charAt(0).toUpperCase() : 'C'}
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{profile.candidate_name}</h1>
                
                {/* CONDITIONAL BADGE RENDERING */}
                {status === 'ALLOCATED' ? (
                  <div className="inline-flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold border inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>ALLOCATED</span>
                    </span>
                    {profile.allocated_at && (
                      <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-emerald-600" />
                        <span>Assigned {new Date(profile.allocated_at).toLocaleDateString()}</span>
                      </span>
                    )}
                  </div>
                ) : status === 'REJECTED' ? (
                  <span className="px-3 py-1 rounded-full text-xs font-bold border inline-flex items-center gap-1.5 bg-rose-50 text-rose-700 border-rose-200 shadow-sm">
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    <span>REJECTED / PASSED</span>
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-bold border inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border-amber-200 shadow-sm">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>PENDING ALLOCATION</span>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <FolderKanban className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Target Project:</span>
                  <strong className="text-slate-800">{profile.project_name || `Project #${projectId}`}</strong>
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1 font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-bold text-slate-700">
                  <Hash className="w-3 h-3 text-indigo-500" />
                  {profile.project_code || 'PRJ-SPEC'}
                </span>
              </div>
            </div>
          </div>

          {/* Prominent Match Score Ring / Badge */}
          <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 p-4 rounded-2xl flex-shrink-0">
            <div className="text-right">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Match Fit</div>
              <div className="text-xs font-bold text-slate-700">
                {score >= 75 ? 'Strong Match' : score >= 50 ? 'Moderate Match' : 'Gap Detected'}
              </div>
            </div>
            <div className="relative w-16 h-16 rounded-full bg-white border-4 border-indigo-500 flex items-center justify-center shadow-inner">
              <span className="text-lg font-black text-indigo-600">{score}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. CANDIDATE IDENTITY & OCR METRICS CARD */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Email */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase text-slate-400">Email Address</div>
            <div className="text-xs font-bold text-slate-900 truncate mt-0.5" title={profile.candidate_email}>
              {profile.candidate_email || 'candidate@enterprise.com'}
            </div>
          </div>
        </div>

        {/* Uploaded Document */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase text-slate-400">Uploaded Document</div>
            <div className="text-xs font-bold text-slate-900 truncate mt-0.5" title={profile.candidate_filename}>
              {profile.candidate_filename || 'Resume_Document.pdf'}
            </div>
          </div>
          <Download className="w-4 h-4 text-slate-400 hover:text-indigo-600 cursor-pointer flex-shrink-0" />
        </div>

        {/* Upload Date / Allocation Date */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase text-slate-400">Processed Date</div>
            <div className="text-xs font-bold text-slate-900 mt-0.5">
              {profile.uploaded_at ? new Date(profile.uploaded_at).toLocaleDateString() : 'Verified Active'}
            </div>
          </div>
        </div>

        {/* AI OCR Verification Status */}
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase text-slate-400">OCR Verification</div>
            <div className="text-xs font-bold text-emerald-600 mt-0.5 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>Extracted & Validated</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. AI COMPATIBILITY VECTORS (LARGE STATISTIC CARDS) */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 tracking-tight">Project Compatibility Vectors</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Core Skills Match */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
              <span>Core Skills Fit</span>
              <span className="font-bold text-indigo-600">{breakdown.skills}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${breakdown.skills}%` }} />
            </div>
            <div className="text-[11px] text-slate-400">Matches technical stack keywords</div>
          </div>

          {/* Experience Match */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
              <span>Experience Vector</span>
              <span className="font-bold text-blue-600">{breakdown.experience}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full" style={{ width: `${breakdown.experience}%` }} />
            </div>
            <div className="text-[11px] text-slate-400">Seniority & duration requirements</div>
          </div>

          {/* Education Match */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
              <span>Education Vector</span>
              <span className="font-bold text-emerald-600">{breakdown.education}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${breakdown.education}%` }} />
            </div>
            <div className="text-[11px] text-slate-400">Degree & domain alignment</div>
          </div>

          {/* Certifications Match */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
              <span>Credentials Vector</span>
              <span className="font-bold text-purple-600">{breakdown.certifications}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-purple-600 rounded-full" style={{ width: `${breakdown.certifications}%` }} />
            </div>
            <div className="text-[11px] text-slate-400">Professional credentials & training</div>
          </div>
        </div>
      </div>

      {/* 5. EXECUTIVE MATCH SYNTHESIS (BLOCKQUOTE) */}
      {profile.recommendation && (
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-5 shadow-sm space-y-1.5">
          <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Executive Match Synthesis</span>
          </div>
          <blockquote className="text-xs text-indigo-950 font-medium leading-relaxed italic border-l-2 border-indigo-400 pl-3">
            "{profile.recommendation}"
          </blockquote>
        </div>
      )}

      {/* 6. EXTRACTED SKILLS ROSTER */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Extracted Skills & Competencies</h3>
        <div className="flex flex-wrap gap-2">
          {skills.length > 0 ? (
            skills.map((skill: string, idx: number) => (
              <span
                key={idx}
                className="px-3 py-1 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 text-xs font-medium"
              >
                {skill}
              </span>
            ))
          ) : (
            <p className="text-xs text-slate-400 italic">No specific skills parsed.</p>
          )}
        </div>
      </div>

      {/* 7. EVIDENCE-BACKED VERIFICATION BREAKDOWN (SPLIT TWO-COLUMN LAYOUT) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Matched Requirements Column */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Matched Requirements & Proof</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
              {matchedReqs.length} Met
            </span>
          </div>

          {matchedReqs.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No direct requirement matches logged.</p>
          ) : (
            <div className="space-y-3">
              {matchedReqs.map((req: any, idx: number) => (
                <div key={idx} className="p-3.5 rounded-xl bg-emerald-50/40 border border-emerald-100 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{req.requirement}</span>
                    <span className="text-[10px] font-semibold text-emerald-700 uppercase bg-emerald-100/60 px-2 py-0.5 rounded">
                      {req.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed font-mono bg-white p-2 rounded-lg border border-emerald-100">
                    "{req.evidence}"
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Missing Requirements / Gaps Column */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-900">Missing Requirements & Gaps</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">
              {missingReqs.length} Gap{missingReqs.length === 1 ? '' : 's'}
            </span>
          </div>

          {missingReqs.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <h4 className="text-xs font-bold text-slate-700">Zero Critical Gaps Detected</h4>
              <p className="text-xs text-slate-500">Candidate satisfies all key criteria for this project role.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {missingReqs.map((gap: any, idx: number) => (
                <div key={idx} className="p-3.5 rounded-xl bg-amber-50/40 border border-amber-200/60 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{gap.requirement}</span>
                    <span className="text-[10px] font-semibold text-amber-700 uppercase bg-amber-100/60 px-2 py-0.5 rounded">
                      {gap.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed bg-white p-2 rounded-lg border border-amber-100">
                    {gap.reason}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 8. BOTTOM ACTION FOOTER */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="text-xs font-bold text-slate-800">Ready to adjust project team allotment?</h4>
          <p className="text-xs text-slate-500">All changes immediately update capacity indicators and team composition.</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {status === 'ALLOCATED' ? (
            <button
              onClick={() => handleUpdateStatus('PENDING')}
              disabled={isActionLoading}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <UserMinus className="w-4 h-4" />
              <span>Release / Remove Resource</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => handleUpdateStatus('ALLOCATED')}
                disabled={isActionLoading}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <UserCheck className="w-4 h-4" />
                <span>Approve / Allocate to Project</span>
              </button>

              {status !== 'REJECTED' && (
                <button
                  onClick={() => handleUpdateStatus('REJECTED')}
                  disabled={isActionLoading}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                >
                  <UserX className="w-4 h-4" />
                  <span>Reject / Pass</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
