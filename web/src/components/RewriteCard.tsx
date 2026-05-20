import { useState } from 'react';
import { useTranslation } from '../i18n/I18nContext';
import type { ParagraphVersion, RewriteCardState } from '../types';
import VersionTimeline from './VersionTimeline';

interface Props {
  paragraphIndex: number;
  originalContent: string;
  streamedContent: string;
  cardState: RewriteCardState;
  guidance: string;
  progress?: number;
  onStop?: () => void;
  onGuidanceChange: (text: string) => void;
  onAccept: () => void;
  onRegenerate: () => void;
  onStartGuidance: () => void;
  onCancelGuidance: () => void;
  onStartEdit: () => void;
  onConfirmEdit: (content: string) => void;
  versions?: ParagraphVersion[];
  previewVersion?: ParagraphVersion | null;
  onVersionPreview?: (version: ParagraphVersion | null) => void;
  onVersionRestore?: (version: ParagraphVersion) => void;
  onUpdateVersionLabel?: (versionId: string, label: string) => void;
}

export default function RewriteCard({
  paragraphIndex,
  originalContent,
  streamedContent,
  cardState,
  guidance,
  progress,
  onStop,
  onGuidanceChange,
  onAccept,
  onRegenerate,
  onStartGuidance,
  onCancelGuidance,
  onStartEdit,
  onConfirmEdit,
  versions = [],
  previewVersion = null,
  onVersionPreview,
  onVersionRestore,
  onUpdateVersionLabel,
}: Props) {
  const { t } = useTranslation();
  const [editText, setEditText] = useState(streamedContent);

  const isStreaming = cardState === 'streaming' || cardState === 'regenerating';
  const isDone = cardState === 'stream_done';
  const isAccepted = cardState === 'accepted';
  const isEditing = cardState === 'editing';
  const isGuidance = cardState === 'guidance_input';
  const errorLabel = t('rewrite.errorLabel');
  const hasError = streamedContent.startsWith(errorLabel);

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
          {t('common.paragraph', { n: paragraphIndex + 1 })}
        </span>
        <span className="text-xs text-slate-400 font-mono">
          {t('rewrite.originalChars', { n: originalContent.length })}
          {streamedContent && ` ${t('rewrite.rewrittenChars', { n: streamedContent.length })}`}
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
        <div className="mb-3">
          <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
            {streamedContent || (
              <span className="text-slate-300 italic">{t('rewrite.waiting')}</span>
            )}
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-amber-400 animate-pulse ml-0.5 align-middle" />
            )}
          </p>

          {/* Progress bar */}
          {isStreaming && progress !== undefined && (
            <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
              <div
                className="bg-amber-400 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
              />
            </div>
          )}

          {/* Stop button during streaming */}
          {isStreaming && (
            <button
              onClick={onStop}
              className="mt-2 px-2 py-0.5 text-xs rounded border border-red-300 text-red-500 hover:bg-red-50 cursor-pointer"
            >
              {t('common.stop')}
            </button>
          )}
        </div>
      )}

      {/* Guidance input */}
      {isGuidance && (
        <div className="mb-3">
          <input
            type="text"
            value={guidance}
            onChange={(e) => onGuidanceChange(e.target.value)}
            placeholder={t('rewrite.guidancePlaceholder')}
            className="w-full p-2 border border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-400 outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && guidance.trim()) {
                onRegenerate();
              }
              if (e.key === 'Escape') {
                onCancelGuidance();
              }
            }}
          />
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-slate-400">{t('rewrite.guidanceHint')}</p>
            <button
              onClick={onCancelGuidance}
              className="px-2 py-0.5 text-xs rounded border border-slate-300 text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {isDone && (
          <>
            {hasError ? (
              <>
                <span className="text-xs text-red-500 self-center">{streamedContent.slice(0, 30)}...</span>
                <button
                  onClick={onRegenerate}
                  className="px-3 py-1 text-xs rounded bg-amber-500 text-white hover:bg-amber-600 cursor-pointer"
                >
                  {t('common.retry')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onAccept}
                  className="px-3 py-1 text-xs rounded bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer"
                >
                  {t('common.accept')}
                </button>
                <button
                  onClick={onRegenerate}
                  className="px-3 py-1 text-xs rounded border border-amber-300 text-amber-600 hover:bg-amber-50 cursor-pointer"
                >
                  {t('rewrite.regenerate')}
                </button>
                <button
                  onClick={onStartGuidance}
                  className="px-3 py-1 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  {t('rewrite.guidedRewrite')}
                </button>
                <button
                  onClick={() => {
                    setEditText(streamedContent);
                    onStartEdit();
                  }}
                  className="px-3 py-1 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  {t('rewrite.manualEdit')}
                </button>
              </>
            )}
          </>
        )}

        {isEditing && (
          <>
            <button
              onClick={() => onConfirmEdit(editText)}
              className="px-3 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600 cursor-pointer"
            >
              {t('rewrite.confirmEdit')}
            </button>
            <button
              onClick={onAccept}
              className="px-3 py-1 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              {t('common.cancel')}
            </button>
          </>
        )}

        {isAccepted && (
          <span className="text-xs text-emerald-600 font-medium">
            {t('rewrite.confirmed')}
          </span>
        )}
      </div>

      {/* Version history (shown when versions exist) */}
      {onVersionPreview && onVersionRestore && onUpdateVersionLabel && (
        <VersionTimeline
          versions={versions}
          currentContent={streamedContent}
          activePreviewId={previewVersion?.versionId ?? null}
          onPreview={onVersionPreview}
          onRestore={onVersionRestore}
          onUpdateLabel={onUpdateVersionLabel}
        />
      )}

      {/* Preview banner */}
      {previewVersion && (
        <div className="mt-2 p-2 rounded bg-blue-50 border border-blue-200 text-xs flex items-center justify-between">
          <span className="text-blue-600">
            {t('rewrite.previewing', { label: previewVersion.label, n: previewVersion.roundNumber })}
          </span>
          <button
            onClick={() => onVersionPreview?.(null)}
            className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-600 hover:bg-blue-200 cursor-pointer"
          >
            {t('rewrite.exitPreview')}
          </button>
        </div>
      )}
    </div>
  );
}
