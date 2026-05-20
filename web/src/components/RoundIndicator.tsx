import type { RewriteRound } from '../types';

interface Props {
  currentRound: number;
  rounds: RewriteRound[];
  className?: string;
}

export default function RoundIndicator({ currentRound, rounds, className = '' }: Props) {
  if (rounds.length === 0) {
    return (
      <div className={`flex items-center gap-2 text-xs text-slate-400 ${className}`}>
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-200 text-slate-600 font-bold">
          {currentRound}
        </span>
        <span>Round {currentRound}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 text-xs ${className}`}>
      <div className="flex items-center gap-1">
        {rounds.map((r) => (
          <span
            key={r.round_num}
            title={`Round ${r.round_num}: 改写段落 ${r.target_indices.map((i) => i + 1).join(', ')} (${Object.keys(r.results).length} 段)`}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs cursor-default"
          >
            {r.round_num}
          </span>
        ))}
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-white font-bold text-xs">
          {currentRound}
        </span>
      </div>
      <span className="text-slate-400">
        Round {currentRound}（已提交 {rounds.length} 轮）
      </span>
    </div>
  );
}
