import type { Paragraph } from '../types';
import ArticleView from './ArticleView';

interface Props {
  title: string;
  paragraphs: Paragraph[];
  targetIndices: number[];
  confirmedIndices: number[];
  rewrittenContents: Record<number, string>;
  selectable: boolean;
  onParagraphClick: (index: number) => void;
  children?: React.ReactNode;
}

export default function ArticlePanel({
  title,
  paragraphs,
  targetIndices,
  confirmedIndices,
  rewrittenContents,
  selectable,
  onParagraphClick,
  children,
}: Props) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
        {title}
      </h2>
      <ArticleView
        paragraphs={paragraphs}
        targetIndices={targetIndices}
        confirmedIndices={confirmedIndices}
        rewrittenContents={rewrittenContents}
        selectable={selectable}
        onParagraphClick={onParagraphClick}
      />
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
