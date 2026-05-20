import { useState } from 'react';
import type { RewriteCardState } from '../types';

interface Props {
  paragraphIndex: number;
  originalContent: string;
  streamedContent: string;
  cardState: RewriteCardState;
  guidance: string;
  onGuidanceChange: (text: string) => void;
  onAccept: () => void;
  onRegenerate: () => void;
  onStartGuidance: () => void;
  onStartEdit: () => void;
  onConfirmEdit: (content: string) => void;
}

export default function RewriteCard({
  paragraphIndex,
  originalContent,
  streamedContent,
  cardState,
  guidance,
  onGuidanceChange,
  onAccept,
  onRegenerate,
  onStartGuidance,
  onStartEdit,
  onConfirmEdit,
}: Props) {
  const [editText, setEditText] = useState(streamedContent);

  const isStreaming = cardState === 'streaming' || cardState === 'regenerating';
  const isDone = cardState === 'stream_done';
  const isAccepted = cardState === 'accepted';
  const isEditing = cardState === 'editing';
  const isGuidance = cardState === 'guidance_input';

  return (
    <div
      className={`rounded-lg border-2 p-4 transition-all ${
        isAccepted
          ? 'border-emerald-300 bg-emerald-50'
          : isStreaming
            ? 'border-amber-300 bg-amber-50'
            : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-400">
          段落 {paragraphIndex + 1}
        </span>
        <span className="text-xs text-slate-400 font-mono">
          原文 {originalContent.length} 字
          {streamedContent && ` → ${streamedContent.length} 字`}
        </span>
      </div>

      {/* Content */}
      {isEditing ? (
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          className="w-full h-32 p-2 border border-slate-300 rounded text-sm resize-y focus:ring-2 focus:ring-blue-400 outline-none"
        />
      ) : (
        <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap mb-3">
          {streamedContent || (
            <span className="text-slate-300 italic">等待生成...</span>
          )}
          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-amber-400 animate-pulse ml-0.5 align-middle" />
          )}
        </p>
      )}

      {/* Guidance input */}
      {isGuidance && (
        <div className="mb-3">
          <input
            type="text"
            value={guidance}
            onChange={(e) => onGuidanceChange(e.target.value)}
            placeholder="输入改写指导，如：语气更正式一些..."
            className="w-full p-2 border border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-400 outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && guidance.trim()) {
                onRegenerate();
              }
            }}
          />
          <p className="text-xs text-slate-400 mt-1">按 Enter 提交</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {isDone && (
          <>
            <button
              onClick={onAccept}
              className="px-3 py-1 text-xs rounded bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer"
            >
              接受
            </button>
            <button
              onClick={onStartGuidance}
              className="px-3 py-1 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              指导重写
            </button>
            <button
              onClick={() => {
                setEditText(streamedContent);
                onStartEdit();
              }}
              className="px-3 py-1 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              手动编辑
            </button>
          </>
        )}

        {isEditing && (
          <>
            <button
              onClick={() => onConfirmEdit(editText)}
              className="px-3 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 cursor-pointer"
            >
              确认编辑
            </button>
            <button
              onClick={onAccept}
              className="px-3 py-1 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              取消
            </button>
          </>
        )}

        {isAccepted && (
          <span className="text-xs text-emerald-600 font-medium">
            已确认 ✓
          </span>
        )}
      </div>
    </div>
  );
}
