import { type Paragraph } from '../types';
import ParagraphCard from './ParagraphCard';

interface Props {
  paragraphs: Paragraph[];
  targetIndices: number[];
  confirmedIndices: number[];
  rewrittenContents: Record<number, string>;
  selectable?: boolean;
  onParagraphClick?: (index: number) => void;
}

export default function ArticleView({
  paragraphs,
  targetIndices,
  confirmedIndices,
  rewrittenContents,
  selectable = false,
  onParagraphClick,
}: Props) {
  return (
    <div className="space-y-2">
      {paragraphs.map((p) => (
        <ParagraphCard
          key={p.index}
          paragraph={p}
          isTarget={targetIndices.includes(p.index)}
          isConfirmed={confirmedIndices.includes(p.index)}
          rewrittenContent={rewrittenContents[p.index]}
          selectable={selectable}
          onClick={onParagraphClick ? () => onParagraphClick(p.index) : undefined}
        />
      ))}
    </div>
  );
}
