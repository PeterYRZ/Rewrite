import type { AppConfigResponse } from '../types';

interface Props {
  config: AppConfigResponse;
  activeModel: string;
  loading: boolean;
  onModelChange: (model: string) => void;
  onTemperatureChange: (temp: number) => void;
}

export default function ConfigPanel({
  config,
  activeModel,
  loading,
  onModelChange,
  onTemperatureChange,
}: Props) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <select
        value={activeModel}
        onChange={(e) => onModelChange(e.target.value)}
        disabled={loading}
        className="border border-slate-200 rounded px-2 py-1 text-slate-600 text-sm bg-white disabled:opacity-50"
      >
        {config.models.map((m) => (
          <option key={m.name} value={m.name}>
            {m.name}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-1 text-slate-400 text-xs">
        T
        <input
          type="number"
          min={0}
          max={2}
          step={0.1}
          value={config.rewrite.temperature}
          onChange={(e) => onTemperatureChange(parseFloat(e.target.value) || 0.7)}
          className="w-12 border border-slate-200 rounded px-1 py-0.5 text-slate-600 text-sm"
          title="Temperature"
        />
      </label>
    </div>
  );
}
