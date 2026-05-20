import { type Paragraph } from '../types';

interface Props {
  paragraph: Paragraph;
  isTarget: boolean;
  isConfirmed: boolean;
  rewrittenContent?: string;
  selectable?: boolean;
  onClick?: () => void;
}

export default function ParagraphCard({
  paragraph,
  isTarget,
  isConfirmed,
  rewrittenContent,
  selectable = false,
  onClick,
}: Props) {
  const content = rewrittenContent ?? paragraph.content;

  const borderColor = isConfirmed
    ? 'border-emerald-300'
    : isTarget
      ? 'border-blue-400 ring-1 ring-blue-200'
      : 'border-slate-200';

  const bgColor = isConfirmed
    ? 'bg-emerald-50'
    : isTarget
      ? 'bg-blue-50'
      : 'bg-white';

  return (
    <div
      className={`rounded-lg border-2 p-4 transition-all ${borderColor} ${bgColor} ${
        selectable ? 'cursor-pointer hover:shadow-md' : ''
      }`}
      onClick={selectable ? onClick : undefined}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-400">
          段落 {paragraph.index + 1}
        </span>
        <span className="flex items-center gap-2">
          {isConfirmed && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
              已确认
            </span>
          )}
          {isTarget && !isConfirmed && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
              已选
            </span>
          )}
          {selectable && (
            <span className={`text-lg ${isTarget ? 'text-blue-600' : 'text-slate-300'}`}>
              {isTarget ? '☑' : '☐'}
            </span>
          )}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
        {content}
      </p>
    </div>
  );
}
