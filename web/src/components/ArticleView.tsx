import { type Paragraph } from '../types';
import ParagraphCard from './ParagraphCard';

interface Props {
  paragraphs: Paragraph[];
  targetIndices: number[];
  confirmedIndices: number[];
  currentParagraphIndex: number | null;
  rewrittenContents: Record<number, string>;
  onParagraphClick?: (index: number) => void;
}

export default function ArticleView({
  paragraphs,
  targetIndices,
  confirmedIndices,
  currentParagraphIndex,
  rewrittenContents,
  onParagraphClick,
}: Props) {
  return (
    <div className="space-y-2">
      {paragraphs.map((p) => (
        <ParagraphCard
          key={p.index}
          paragraph={p}
          isTarget={targetIndices.includes(p.index)}
          isCurrent={p.index === currentParagraphIndex}
          isConfirmed={confirmedIndices.includes(p.index)}
          rewrittenContent={rewrittenContents[p.index]}
          onClick={onParagraphClick ? () => onParagraphClick(p.index) : undefined}
        />
      ))}
    </div>
  );
}
