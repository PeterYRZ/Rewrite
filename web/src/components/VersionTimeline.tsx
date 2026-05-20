import { useState } from 'react';
import type { ParagraphVersion } from '../types';

interface Props {
  versions: ParagraphVersion[];
  currentContent: string;
  activePreviewId: string | null;
  onPreview: (version: ParagraphVersion | null) => void;
  onRestore: (version: ParagraphVersion) => void;
  onUpdateLabel: (versionId: string, label: string) => void;
}

export default function VersionTimeline({
  versions,
  currentContent,
  activePreviewId,
  onPreview,
  onRestore,
  onUpdateLabel,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [labelText, setLabelText] = useState('');

  if (versions.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-slate-100">
      <button
        onClick={() => { setExpanded(!expanded); }}
        className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
        历史版本 ({versions.length})
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
          {/* Current version */}
          <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-emerald-700">当前版本</span>
              <span className="text-emerald-500">
                {currentContent.length} 字
              </span>
            </div>
            <p className="text-emerald-600 mt-0.5 line-clamp-2">
              {currentContent.slice(0, 100)}...
            </p>
          </div>

          {/* Historical versions */}
          {versions.map((v) => {
            const isPreviewing = activePreviewId === v.versionId;
            return (
              <div
                key={v.versionId}
                className={`p-2 rounded border text-xs transition-colors ${
                  isPreviewing
                    ? 'bg-blue-50 border-blue-300'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {editingLabelId === v.versionId ? (
                      <input
                        value={labelText}
                        onChange={(e) => setLabelText(e.target.value)}
                        onBlur={() => {
                          onUpdateLabel(v.versionId, labelText);
                          setEditingLabelId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onUpdateLabel(v.versionId, labelText);
                            setEditingLabelId(null);
                          }
                          if (e.key === 'Escape') setEditingLabelId(null);
                        }}
                        className="w-20 p-0.5 border border-blue-300 rounded text-xs outline-none"
                        autoFocus
                      />
                    ) : (
                      <span
                        className="font-medium text-slate-600 cursor-pointer hover:text-blue-600"
                        onClick={() => {
                          setEditingLabelId(v.versionId);
                          setLabelText(v.label);
                        }}
                        title="点击编辑标签"
                      >
                        {v.label}
                      </span>
                    )}
                    <span className="text-slate-400">
                      {new Date(v.createdAt).toLocaleString('zh-CN')}
                    </span>
                    {isPreviewing && (
                      <span className="text-blue-500 font-medium">正在预览</span>
                    )}
                  </div>
                  <span className="text-slate-400">{v.content.length} 字</span>
                </div>
                <p className="text-slate-500 mt-0.5 line-clamp-2">
                  {v.content.slice(0, 100)}...
                </p>
                <div className="flex gap-1.5 mt-1.5">
                  {isPreviewing ? (
                    <button
                      onClick={() => onPreview(null)}
                      className="px-2 py-0.5 text-xs rounded border border-blue-300 text-blue-600 bg-blue-100 hover:bg-blue-200 cursor-pointer"
                    >
                      退出预览
                    </button>
                  ) : (
                    <button
                      onClick={() => onPreview(v)}
                      className="px-2 py-0.5 text-xs rounded border border-blue-200 text-blue-500 hover:bg-blue-50 cursor-pointer"
                    >
                      预览
                    </button>
                  )}
                  <button
                    onClick={() => onRestore(v)}
                    className="px-2 py-0.5 text-xs rounded border border-amber-200 text-amber-600 hover:bg-amber-50 cursor-pointer"
                  >
                    恢复到此版本
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
