import { type Mode } from '../types';

interface Props {
  mode: Mode;
  onChange: (mode: Mode) => void;
  disabled: boolean;
}

export default function ModeSelector({ mode, onChange, disabled }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500 mr-2">模式:</span>
      {(['auto', 'interactive'] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          disabled={disabled}
          className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors cursor-pointer ${
            mode === m
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          } disabled:opacity-50`}
        >
          {m === 'auto' ? '全自动' : '交互式'}
        </button>
      ))}
    </div>
  );
}
