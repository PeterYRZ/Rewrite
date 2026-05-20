import { useState, useCallback } from 'react';
import type { Paragraph, RewriteCardState } from '../types';

export function useArticleState() {
  const [articleText, setArticleText] = useState('');
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [targetIndices, setTargetIndices] = useState<number[]>([]);
  const [confirmedIndices, setConfirmedIndices] = useState<number[]>([]);
  const [rewrittenContents, setRewrittenContents] = useState<Record<number, string>>({});
  const [cardStates, setCardStates] = useState<Record<number, RewriteCardState>>({});

  const parseArticle = useCallback((text: string) => {
    const parts = text.split('\n\n').filter((p) => p.trim());
    setParagraphs(
      parts.map((content, i) => ({
        index: i,
        content: content.trim(),
        status: 'original' as const,
      })),
    );
  }, []);

  const loadArticle = useCallback(
    (text: string) => {
      setArticleText(text);
      parseArticle(text);
      resetSelection();
    },
    [parseArticle],
  );

  const toggleTarget = useCallback((index: number) => {
    setTargetIndices((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index].sort((a, b) => a - b),
    );
  }, []);

  const setRewrittenContent = useCallback(
    (paraIndex: number, content: string) => {
      setRewrittenContents((prev) => ({ ...prev, [paraIndex]: content }));
    },
    [],
  );

  /** Append a token to the streaming content for a paragraph.
   *  Uses functional update to avoid React stale-closure issues. */
  const appendToken = useCallback((paraIndex: number, token: string) => {
    setRewrittenContents((prev) => ({
      ...prev,
      [paraIndex]: (prev[paraIndex] || '') + token,
    }));
  }, []);

  const markConfirmed = useCallback((paraIndex: number) => {
    setConfirmedIndices((prev) =>
      prev.includes(paraIndex) ? prev : [...prev, paraIndex],
    );
    setCardStates((prev) => ({ ...prev, [paraIndex]: 'accepted' }));
  }, []);

  const setCardState = useCallback(
    (paraIndex: number, state: RewriteCardState) => {
      setCardStates((prev) => ({ ...prev, [paraIndex]: state }));
    },
    [],
  );

  const replaceParagraphs = useCallback(
    (newParagraphs: Paragraph[]) => {
      setParagraphs(newParagraphs);
      setArticleText(newParagraphs.map((p) => p.content).join('\n\n'));
    },
    [],
  );

  const resetSelection = useCallback(() => {
    setTargetIndices([]);
    setConfirmedIndices([]);
    setRewrittenContents({});
    setCardStates({});
  }, []);

  const allConfirmed = useCallback(() => {
    return (
      targetIndices.length > 0 &&
      targetIndices.every((i) => confirmedIndices.includes(i))
    );
  }, [targetIndices, confirmedIndices]);

  const remainingTargets = useCallback(() => {
    return targetIndices.filter((i) => !confirmedIndices.includes(i));
  }, [targetIndices, confirmedIndices]);

  return {
    articleText,
    setArticleText,
    paragraphs,
    setParagraphs,
    targetIndices,
    toggleTarget,
    confirmedIndices,
    rewrittenContents,
    setRewrittenContent,
    appendToken,
    cardStates,
    setCardState,
    markConfirmed,
    loadArticle,
    parseArticle,
    resetSelection,
    replaceParagraphs,
    allConfirmed,
    remainingTargets,
  };
}
