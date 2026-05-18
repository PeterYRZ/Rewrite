interface Props {
  candidates: string[];
  paragraphIndex: number;
  onSelect: (index: number) => void;
  onRegenerate: () => void;
  onSkip: () => void;
  loading: boolean;
}

export default function CandidatePicker({
  candidates,
  paragraphIndex,
  onSelect,
  onRegenerate,
  onSkip,
  loading,
}: Props) {
  return (
    <div className="bg-white rounded-xl border-2 border-amber-300 p-6 space-y-4 shadow-lg">
      <h3 className="text-lg font-bold text-amber-700">
        段落 {paragraphIndex + 1} — 选择改写候选
      </h3>

      {loading ? (
        <div className="flex items-center gap-3 text-slate-500 py-8 justify-center">
          <div className="animate-spin h-5 w-5 border-2 border-amber-400 border-t-transparent rounded-full" />
          <span>正在生成 {candidates.length || 3} 个候选...</span>
        </div>
      ) : (
        <div className="grid gap-3">
          {candidates.map((c, i) => (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className="text-left p-4 rounded-lg border border-slate-200 hover:border-cyan-400 hover:bg-cyan-50 transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">
                  候选 {i + 1}
                </span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap group-hover:text-slate-800">
                {c.slice(0, 400)}{c.length > 400 ? '...' : ''}
              </p>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-slate-100">
        <button
          onClick={onRegenerate}
          disabled={loading}
          className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
        >
          🔄 重新生成
        </button>
        <button
          onClick={onSkip}
          disabled={loading}
          className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
        >
          ⏭ 保留原文
        </button>
      </div>
    </div>
  );
}
