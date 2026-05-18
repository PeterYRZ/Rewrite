import { type Paragraph } from '../types';

interface Props {
  paragraph: Paragraph;
  isTarget: boolean;
  isCurrent: boolean;
  isConfirmed: boolean;
  rewrittenContent?: string;
  onClick?: () => void;
}

export default function ParagraphCard({
  paragraph,
  isTarget,
  isCurrent,
  isConfirmed,
  rewrittenContent,
  onClick,
}: Props) {
  const content = rewrittenContent ?? paragraph.content;

  const borderColor = isCurrent
    ? 'border-amber-400 ring-2 ring-amber-200'
    : isConfirmed
      ? 'border-emerald-300'
      : isTarget
        ? 'border-blue-300'
        : 'border-slate-200';

  const bgColor = isCurrent
    ? 'bg-amber-50'
    : isConfirmed
      ? 'bg-emerald-50'
      : isTarget
        ? 'bg-blue-50'
        : 'bg-white';

  const badge = isCurrent
    ? { text: '待改写', cls: 'bg-amber-100 text-amber-700' }
    : isConfirmed
      ? { text: '已确认', cls: 'bg-emerald-100 text-emerald-700' }
      : isTarget
        ? { text: '目标段落', cls: 'bg-blue-100 text-blue-700' }
        : null;

  return (
    <div
      className={`rounded-lg border-2 p-4 transition-all ${borderColor} ${bgColor} ${
        onClick ? 'cursor-pointer hover:shadow-md' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-400">
          段落 {paragraph.index + 1}
        </span>
        {badge && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>
            {badge.text}
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
}
