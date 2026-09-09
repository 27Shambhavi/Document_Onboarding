import React from 'react';
import { CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

export interface MatchedRequirement {
  category: string;
  requirement: string;
  evidence: string;
}

export interface MissingRequirement {
  category: string;
  requirement: string;
  reason: string;
}

interface RequirementMatchProps {
  matched: MatchedRequirement[];
  missing: MissingRequirement[];
  compact?: boolean;
}

export const RequirementMatch: React.FC<RequirementMatchProps> = ({
  matched = [],
  missing = [],
  compact = false,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* 1. MATCHED CRITERIA */}
      <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-4 flex flex-col h-full">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-emerald-200">
          <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Matched Requirements</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold">
            {matched.length} Verified
          </span>
        </div>

        {matched.length === 0 ? (
          <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 italic text-center flex flex-col items-center justify-center gap-1.5 my-auto py-6">
            <span className="font-semibold text-rose-900">0% Criteria Matched</span>
            <span>No relevant professional qualifications or matching resume criteria detected in this document.</span>
          </div>
        ) : (
          <div className="space-y-2.5 overflow-y-auto max-h-80 pr-1">
            {matched.map((item, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg bg-white border border-emerald-200 text-xs shadow-sm transition-all hover:border-emerald-400"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-semibold text-slate-900">{item.requirement}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium whitespace-nowrap">
                    {item.category || 'Skill'}
                  </span>
                </div>
                {!compact && item.evidence && (
                  <div className="mt-1 text-[11px] text-emerald-900 bg-emerald-50 px-2 py-1.5 rounded border-l-2 border-emerald-500 font-mono leading-relaxed">
                    "{item.evidence}"
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. MISSING / GAPS */}
      <div className="rounded-xl border border-rose-300 bg-rose-50/60 p-4 flex flex-col h-full">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-rose-200">
          <div className="flex items-center gap-2 text-rose-800 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>Missing / Unmet Requirements</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-bold">
            {missing.length} Gaps
          </span>
        </div>

        {missing.length === 0 ? (
          <div className="text-xs text-emerald-700 py-4 text-center flex items-center justify-center gap-1.5 font-semibold">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Candidate meets 100% of the extracted job requirements!</span>
          </div>
        ) : (
          <div className="space-y-2.5 overflow-y-auto max-h-80 pr-1">
            {missing.map((item, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg bg-white border border-rose-200 text-xs shadow-sm transition-all hover:border-rose-400"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="font-semibold text-slate-900">{item.requirement}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium whitespace-nowrap">
                    {item.category || 'Skill'}
                  </span>
                </div>
                {!compact && item.reason && (
                  <div className="mt-1 text-[11px] text-rose-900 bg-rose-50 px-2 py-1.5 rounded border-l-2 border-rose-500 font-mono leading-relaxed">
                    {item.reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
