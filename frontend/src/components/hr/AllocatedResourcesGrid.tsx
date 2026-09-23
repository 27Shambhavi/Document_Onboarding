import React from 'react';
import {
  Users,
  CheckCircle2,
  UserMinus,
  Sparkles,
  Layers,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import type { CandidateAllocation } from '../../api/client';

interface AllocatedResourcesGridProps {
  allocatedResources: CandidateAllocation[];
  teamCapacity: number;
  onDeallocate?: (candidateId: string | number) => void;
  onSelectCandidate?: (candidate: CandidateAllocation | string) => void;
  isLoading?: boolean;
}

export const AllocatedResourcesGrid: React.FC<AllocatedResourcesGridProps> = ({
  allocatedResources,
  teamCapacity = 1,
  onDeallocate,
  onSelectCandidate,
  isLoading = false,
}) => {
  const allocatedCount = allocatedResources.length;
  const capacityPct = Math.min(100, Math.round((allocatedCount / (teamCapacity || 1)) * 100));
  const isFull = allocatedCount >= teamCapacity && teamCapacity > 0;
  const remaining = Math.max(0, teamCapacity - allocatedCount);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 mb-6">
      {/* Header & Capacity Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-500/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Active Team Members / Allocated Resources
              </h2>
              <span
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-bold border ${
                  isFull
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : allocatedCount === 0
                    ? 'bg-amber-50 text-amber-700 border-amber-300'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-300'
                }`}
              >
                {isFull ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>Staffed ({allocatedCount}/{teamCapacity})</span>
                  </>
                ) : allocatedCount === 0 ? (
                  <>
                    <AlertCircle className="w-3 h-3 text-amber-600" />
                    <span>0/{teamCapacity} Allocated</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 text-indigo-600" />
                    <span>{allocatedCount}/{teamCapacity} Allocated ({remaining} open)</span>
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Approved candidate engineers formally assigned to this project
            </p>
          </div>
        </div>

        {/* Real-time Capacity Progress */}
        <div className="w-full sm:w-64 bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex flex-col justify-center">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>Team Capacity</span>
            </span>
            <span className="font-mono text-[11px] text-slate-900">
              {allocatedCount} / {teamCapacity} ({capacityPct}%)
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isFull
                  ? 'bg-emerald-500'
                  : allocatedCount > 0
                  ? 'bg-gradient-to-r from-indigo-500 to-emerald-500'
                  : 'bg-slate-300'
              }`}
              style={{ width: `${capacityPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Grid of Allocated Candidate Cards */}
      {allocatedResources.length === 0 ? (
        <div className="p-8 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center">
          <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <h4 className="text-xs font-bold text-slate-700">No Resources Currently Allocated</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Review ranked candidate profiles below and click{' '}
            <span className="font-semibold text-emerald-600">[ Approve / Allocate to Project ]</span> to assign resources to this team.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {allocatedResources.map((member) => (
            <div
              key={member.id}
              onClick={() => onSelectCandidate && onSelectCandidate(member)}
              className="p-4 rounded-xl border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/20 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all group flex flex-col justify-between cursor-pointer"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shadow-sm flex-shrink-0">
                      {member.candidate_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div
                        className="font-bold text-xs text-slate-900 group-hover:text-indigo-600 transition-colors truncate"
                        title={member.candidate_name}
                      >
                        {member.candidate_name}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate mt-0.5">
                        {member.candidate_email && member.candidate_email !== 'N/A'
                          ? member.candidate_email
                          : member.document_filename || 'Verified Resume'}
                      </div>
                    </div>
                  </div>

                  {member.match_score > 0 && (
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex-shrink-0">
                      {member.match_score}% Fit
                    </span>
                  )}
                </div>

                {member.allocated_at && (
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-2 font-mono">
                    <Calendar className="w-3 h-3 text-emerald-600" />
                    <span>Allocated: {new Date(member.allocated_at).toLocaleDateString()}</span>
                  </div>
                )}

                {member.notes && (
                  <p className="text-[11px] text-slate-600 italic bg-white/80 p-2 rounded-lg border border-slate-100 mt-2 line-clamp-2">
                    "{member.notes}"
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-slate-100">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Assigned</span>
                </span>

                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {onSelectCandidate && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCandidate(member);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold transition-colors cursor-pointer"
                    >
                      View Profile & Proof
                    </button>
                  )}
                  {onDeallocate && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeallocate(member.candidate_id || member.id);
                      }}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                      title="Deallocate resource from project"
                    >
                      <UserMinus className="w-3 h-3" />
                      <span>Release / Remove</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
