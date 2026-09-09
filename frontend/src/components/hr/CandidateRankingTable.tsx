import React, { useState, useMemo } from 'react';
import {
  Search,
  ChevronRight,
  Sparkles,
  Trophy,
  Medal,
  CheckCircle2,
  User,
  ArrowUpDown,
} from 'lucide-react';
import { MatchScore } from './MatchScore';

export interface RankedCandidateItem {
  candidate_id: string | number;
  candidate_name: string;
  candidate_filename: string;
  candidate_email: string;
  score: number;
  rank: number;
  match_status: string;
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
}

interface CandidateRankingTableProps {
  candidates: RankedCandidateItem[];
  onSelectCandidate: (candidate: RankedCandidateItem) => void;
  isLoading?: boolean;
}

export const CandidateRankingTable: React.FC<CandidateRankingTableProps> = ({
  candidates,
  onSelectCandidate,
  isLoading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<'ALL' | 'EXCELLENT' | 'STRONG' | 'MODERATE'>('ALL');
  const [sortField, setSortField] = useState<'rank' | 'score' | 'name'>('rank');
  const [sortAsc, setSortAsc] = useState(true);

  // Filter & Sort
  const filteredCandidates = useMemo(() => {
    return candidates
      .filter((c) => {
        // Search filter
        const matchSearch =
          c.candidate_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.candidate_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.candidate_filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (c.extracted_skills &&
            c.extracted_skills.some((s) => s.toLowerCase().includes(searchTerm.toLowerCase())));

        if (!matchSearch) return false;

        // Tier filter
        if (tierFilter === 'EXCELLENT') return c.score >= 85;
        if (tierFilter === 'STRONG') return c.score >= 70 && c.score < 85;
        if (tierFilter === 'MODERATE') return c.score >= 50 && c.score < 70;

        return true;
      })
      .sort((a, b) => {
        if (sortField === 'rank') {
          return sortAsc ? a.rank - b.rank : b.rank - a.rank;
        }
        if (sortField === 'score') {
          return sortAsc ? a.score - b.score : b.score - a.score;
        }
        if (sortField === 'name') {
          return sortAsc
            ? a.candidate_name.localeCompare(b.candidate_name)
            : b.candidate_name.localeCompare(a.candidate_name);
        }
        return 0;
      });
  }, [candidates, searchTerm, tierFilter, sortField, sortAsc]);

  const handleSort = (field: 'rank' | 'score' | 'name') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'rank');
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-4 h-4 text-amber-500" />;
    if (rank === 2) return <Medal className="w-4 h-4 text-slate-400" />;
    if (rank === 3) return <Medal className="w-4 h-4 text-amber-600" />;
    return <span className="font-mono text-xs font-bold text-slate-500">#{rank}</span>;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Table Toolbar */}
      <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white">
        {/* Search Box */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by candidate, skill, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm text-xs"
          />
        </div>

        {/* Tier Filter Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200 text-xs overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setTierFilter('ALL')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              tierFilter === 'ALL'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({candidates.length})
          </button>
          <button
            onClick={() => setTierFilter('EXCELLENT')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              tierFilter === 'EXCELLENT'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Top Tier (85%+)
          </button>
          <button
            onClick={() => setTierFilter('STRONG')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              tierFilter === 'STRONG'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Strong (70-84%)
          </button>
          <button
            onClick={() => setTierFilter('MODERATE')}
            className={`px-3 py-1 rounded-lg font-medium transition-all ${
              tierFilter === 'MODERATE'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Moderate (50-69%)
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="bg-slate-50 border-b border-slate-200">
              <th
                onClick={() => handleSort('rank')}
                className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer"
              >
                <div className="flex items-center gap-1">
                  <span>Rank</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                onClick={() => handleSort('name')}
                className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer"
              >
                <div className="flex items-center gap-1">
                  <span>Candidate</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th
                onClick={() => handleSort('score')}
                className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer"
              >
                <div className="flex items-center gap-1">
                  <span>Match Score</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Matched Core Competencies</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Gaps / Missing</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Explainable AI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  <div className="inline-flex items-center gap-2">
                    <Sparkles className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>Evaluating candidate profiles against Job Requirements...</span>
                  </div>
                </td>
              </tr>
            ) : filteredCandidates.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <User className="w-8 h-8 text-slate-400" />
                    <span className="font-semibold text-slate-700">No candidates found</span>
                    <span className="text-xs text-slate-500">
                      {searchTerm
                        ? 'Try clearing your search filters'
                        : 'Upload candidate resumes in Audit Engine to evaluate compatibility'}
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredCandidates.map((cand) => (
                <tr
                  key={cand.candidate_id}
                  onClick={() => onSelectCandidate(cand)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer group text-slate-900"
                >
                  {/* Rank Column */}
                  <td className="py-3 px-4 whitespace-nowrap text-slate-900">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-900">
                        {getRankIcon(cand.rank)}
                      </div>
                    </div>
                  </td>

                  {/* Candidate Identity */}
                  <td className="py-3 px-4 whitespace-nowrap text-slate-900">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-bold text-xs flex items-center justify-center shadow-sm flex-shrink-0">
                        {cand.candidate_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {cand.candidate_name}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span className="truncate max-w-[150px]">{cand.candidate_email}</span>
                          <span className="text-slate-300">•</span>
                          <span className="font-mono text-[10px] text-slate-500 truncate max-w-[100px]">
                            {cand.candidate_filename}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Match Score */}
                  <td className="py-3 px-4 whitespace-nowrap text-slate-900">
                    <MatchScore
                      score={cand.score}
                      matchStatus={cand.match_status}
                      scoreBreakdown={cand.score_breakdown}
                      size="sm"
                    />
                  </td>

                  {/* Extracted Core Skills Chips */}
                  <td className="py-3 px-4 text-slate-900">
                    <div className="flex flex-wrap items-center gap-1 max-w-xs">
                      {cand.extracted_skills && cand.extracted_skills.length > 0 ? (
                        <>
                          {cand.extracted_skills.slice(0, 3).map((skill, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 border border-slate-200 text-slate-700"
                            >
                              {skill}
                            </span>
                          ))}
                          {cand.extracted_skills.length > 3 && (
                            <span className="text-[10px] text-slate-500 font-medium">
                              +{cand.extracted_skills.length - 3} more
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">No skills detected</span>
                      )}
                    </div>
                  </td>

                  {/* Missing Count */}
                  <td className="py-3 px-4 whitespace-nowrap text-slate-900">
                    {cand.score === 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                        0% Match / Irrelevant
                      </span>
                    ) : cand.missing_requirements && cand.missing_requirements.length > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        {cand.missing_requirements.length} Gaps
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Full Fit
                      </span>
                    )}
                  </td>

                  {/* Action Button */}
                  <td className="py-3 px-4 text-right whitespace-nowrap text-slate-900">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCandidate(cand);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Explain Match</span>
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
        <span>Showing {filteredCandidates.length} candidate profiles</span>
        <span className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-indigo-600" />
          Powered by Explainable AI Matching
        </span>
      </div>
    </div>
  );
};
