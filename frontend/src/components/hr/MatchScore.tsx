import React, { useState } from 'react';
import { HelpCircle, Sparkles } from 'lucide-react';

interface ScoreBreakdown {
  skills: number;
  experience: number;
  education: number;
  certifications: number;
}

interface MatchScoreProps {
  score: number;
  matchStatus?: string;
  scoreBreakdown?: ScoreBreakdown;
  size?: 'sm' | 'md' | 'lg';
  showPopover?: boolean;
}

export const MatchScore: React.FC<MatchScoreProps> = ({
  score,
  matchStatus,
  scoreBreakdown,
  size = 'md',
  showPopover = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const getTierColor = (val: number) => {
    if (val >= 85) return 'text-emerald-700 bg-emerald-50 border-emerald-300';
    if (val >= 70) return 'text-indigo-700 bg-indigo-50 border-indigo-300';
    if (val >= 50) return 'text-amber-700 bg-amber-50 border-amber-300';
    return 'text-rose-700 bg-rose-50 border-rose-300';
  };

  const getBarColor = (val: number) => {
    if (val >= 85) return 'bg-emerald-500';
    if (val >= 70) return 'bg-indigo-500';
    if (val >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5 font-semibold',
    md: 'text-sm px-2.5 py-1 font-bold',
    lg: 'text-base px-3.5 py-1.5 font-extrabold',
  };

  return (
    <div className="relative inline-flex items-center">
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border shadow-sm transition-all duration-150 ${sizeStyles[size]} ${getTierColor(score)}`}
      >
        <span className="tabular-nums tracking-tight">{score}%</span>
        {matchStatus && (
          <span className="text-[10px] uppercase font-bold tracking-wider opacity-90">
            {matchStatus}
          </span>
        )}
        {showPopover && scoreBreakdown && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
            className="p-0.5 rounded-full hover:bg-black/5 text-current transition-colors cursor-pointer"
            title="View Score Breakdown"
          >
            <HelpCircle className="w-3.5 h-3.5 opacity-80 hover:opacity-100" />
          </button>
        )}
      </div>

      {/* Popover explaining the score */}
      {showPopover && isOpen && scoreBreakdown && (
        <div
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-xl bg-white border border-slate-200 text-slate-800 shadow-xl shadow-slate-900/10 text-xs animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
          role="tooltip"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
            <span className="font-semibold flex items-center gap-1.5 text-slate-800">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              Explainable Score Breakdown
            </span>
            <span className="font-mono font-bold text-indigo-600">{score}%</span>
          </div>

          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-500">Core Skills (55% wt)</span>
                <span className="font-semibold text-slate-800">{scoreBreakdown.skills}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getBarColor(scoreBreakdown.skills)}`}
                  style={{ width: `${Math.min(100, Math.max(0, scoreBreakdown.skills))}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-500">Experience (25% wt)</span>
                <span className="font-semibold text-slate-800">{scoreBreakdown.experience}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getBarColor(scoreBreakdown.experience)}`}
                  style={{ width: `${Math.min(100, Math.max(0, scoreBreakdown.experience))}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-500">Education (15% wt)</span>
                <span className="font-semibold text-slate-800">{scoreBreakdown.education}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getBarColor(scoreBreakdown.education)}`}
                  style={{ width: `${Math.min(100, Math.max(0, scoreBreakdown.education))}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-500">Certifications (5% wt)</span>
                <span className="font-semibold text-slate-800">{scoreBreakdown.certifications}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getBarColor(scoreBreakdown.certifications)}`}
                  style={{ width: `${Math.min(100, Math.max(0, scoreBreakdown.certifications))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
