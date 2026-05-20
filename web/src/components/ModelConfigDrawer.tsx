import { useState } from 'react';
import type { AppConfigResponse } from '../types';

interface NewModelForm {
  name: string;
  provider: string;
  model: string;
  api_base: string;
  api_key: string;
}

const emptyForm: NewModelForm = {
  name: '', provider: 'openai', model: '', api_base: 'https://api.openai.com/v1', api_key: '',
};

interface Props {
  open: boolean;
  config: AppConfigResponse | null;
  activeModel: string;
  loading: boolean;
  onClose: () => void;
  onModelChange: (model: string) => void;
  onTemperatureChange: (temp: number) => void;
  onTokenChange: (tokens: number) => void;
  onAddModel: (form: NewModelForm) => Promise<boolean>;
  onDeleteModel: (name: string) => Promise<boolean>;
}

export default function ModelConfigDrawer({
  open,
  config,
  activeModel,
  loading,
  onClose,
  onModelChange,
  onTemperatureChange,
  onTokenChange,
  onAddModel,
  onDeleteModel,
}: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newModel, setNewModel] = useState<NewModelForm>(emptyForm);
  const [addError, setAddError] = useState('');

  if (!config) return null;

  const handleAdd = async () => {
    setAddError('');
    if (!newModel.name || !newModel.model) {
      setAddError('Name and Model are required');
      return;
    }
    const ok = await onAddModel(newModel);
    if (ok) {
      setNewModel(emptyForm);
      setShowAddForm(false);
    } else {
      setAddError('Failed to add model');
    }
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 transform transition-transform duration-300 overflow-y-auto ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800">模型配置</h3>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Model list */}
          <section>
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">当前模型</h4>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {config.models.map((m) => (
                <label
                  key={m.name}
                  className={`flex items-center justify-between p-2 rounded cursor-pointer text-sm ${
                    activeModel === m.name
                      ? 'bg-slate-100 border border-slate-300'
                      : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="model"
                      checked={activeModel === m.name}
                      onChange={() => onModelChange(m.name)}
                      className="w-3.5 h-3.5"
                    />
                    <div>
                      <div className="font-medium text-slate-700 text-xs">{m.name}</div>
                      <div className="text-xs text-slate-400">{m.provider} / {m.model}</div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.preventDefault(); onDeleteModel(m.name); }}
                    className="text-red-400 hover:text-red-600 text-xs cursor-pointer"
                    title="删除模型"
                  >
                    ✕
                  </button>
                </label>
              ))}
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="mt-2 text-xs text-blue-500 hover:text-blue-700 cursor-pointer"
            >
              {showAddForm ? '取消' : '+ 新增模型'}
            </button>
          </section>

          {/* Add model form */}
          {showAddForm && (
            <section className="p-3 bg-slate-50 rounded space-y-2">
              {addError && <p className="text-xs text-red-500">{addError}</p>}
              <input className="w-full p-1.5 border rounded text-xs" placeholder="Name *"
                value={newModel.name} onChange={e => setNewModel({...newModel, name: e.target.value})} />
              <select className="w-full p-1.5 border rounded text-xs"
                value={newModel.provider} onChange={e => setNewModel({...newModel, provider: e.target.value})}>
                <option value="openai">openai</option>
                <option value="ollama">ollama</option>
              </select>
              <input className="w-full p-1.5 border rounded text-xs" placeholder="Model *"
                value={newModel.model} onChange={e => setNewModel({...newModel, model: e.target.value})} />
              <input className="w-full p-1.5 border rounded text-xs" placeholder="API Base URL"
                value={newModel.api_base} onChange={e => setNewModel({...newModel, api_base: e.target.value})} />
              <input className="w-full p-1.5 border rounded text-xs" placeholder="API Key"
                value={newModel.api_key} onChange={e => setNewModel({...newModel, api_key: e.target.value})} />
              <button onClick={handleAdd} disabled={loading}
                className="w-full py-1.5 bg-slate-800 text-white rounded text-xs hover:bg-slate-700 disabled:opacity-40 cursor-pointer">
                添加
              </button>
            </section>
          )}

          {/* Parameters */}
          <section>
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">生成参数</h4>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-slate-500">Temperature: {config.rewrite.temperature}</span>
                <input type="range" min={0} max={2} step={0.1}
                  value={config.rewrite.temperature}
                  onChange={e => onTemperatureChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded appearance-none cursor-pointer" />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">Max Tokens</span>
                <input type="number" min={100} max={8000} step={100}
                  value={config.rewrite.max_tokens}
                  onChange={e => onTokenChange(parseInt(e.target.value) || 2000)}
                  className="w-full p-1.5 border rounded text-xs mt-1" />
              </label>
            </div>
          </section>

          {/* Validation */}
          {config.validation && (
            <section>
              <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">校验设置</h4>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs text-slate-600">
                  <input type="checkbox" checked={config.validation.enabled} readOnly
                    className="w-3 h-3" />
                  启用
                </label>
                <span className="text-xs text-slate-400">
                  严格度: {config.validation.strictness}
                </span>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
