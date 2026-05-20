import type { Paragraph, RewriteCardState } from '../types';
import RewriteCard from './RewriteCard';

interface Props {
  title: string;
  paragraphs: Paragraph[];
  targetIndices: number[];
  streamedContents: Record<number, string>;
  cardStates: Record<number, RewriteCardState>;
  guidanceMap: Record<number, string>;
  onGuidanceChange: (paraIndex: number, text: string) => void;
  onAccept: (paraIndex: number) => void;
  onRegenerate: (paraIndex: number) => void;
  onStartGuidance: (paraIndex: number) => void;
  onStartEdit: (paraIndex: number) => void;
  onConfirmEdit: (paraIndex: number, content: string) => void;
}

export default function RewritePanel({
  title,
  paragraphs,
  targetIndices,
  streamedContents,
  cardStates,
  guidanceMap,
  onGuidanceChange,
  onAccept,
  onRegenerate,
  onStartGuidance,
  onStartEdit,
  onConfirmEdit,
}: Props) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
        {title}
      </h2>

      {paragraphs.map((p) => {
        if (!targetIndices.includes(p.index)) {
          // Non-target paragraphs: show as unchanged
          return (
            <div
              key={p.index}
              className="rounded-lg border border-slate-100 bg-slate-50 p-3"
            >
              <span className="text-xs text-slate-400">段落 {p.index + 1}</span>
              <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                {p.content.slice(0, 100)}
                {p.content.length > 100 ? '...' : ''}
              </p>
            </div>
          );
        }

        // Target paragraphs: show rewrite card
        return (
          <RewriteCard
            key={p.index}
            paragraphIndex={p.index}
            originalContent={p.content}
            streamedContent={streamedContents[p.index] || ''}
            cardState={cardStates[p.index] || 'pending'}
            guidance={guidanceMap[p.index] || ''}
            onGuidanceChange={(text) => onGuidanceChange(p.index, text)}
            onAccept={() => onAccept(p.index)}
            onRegenerate={() => onRegenerate(p.index)}
            onStartGuidance={() => onStartGuidance(p.index)}
            onStartEdit={() => onStartEdit(p.index)}
            onConfirmEdit={(content) => onConfirmEdit(p.index, content)}
          />
        );
      })}
    </div>
  );
}
