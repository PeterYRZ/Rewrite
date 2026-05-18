import { useState, useCallback } from 'react';
import type {
  Paragraph,
  StepResult,
  ValidationReport,
  SemanticReport,
  Mode,
  RewritePhase,
} from '../types';

const API_BASE = '/api';

export function useRewriteSession() {
  const [mode, setMode] = useState<Mode>('auto');
  const [phase, setPhase] = useState<RewritePhase>('idle');
  const [articleText, setArticleText] = useState('');
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [targetIndices, setTargetIndices] = useState<number[]>([]);
  const [confirmedIndices, setConfirmedIndices] = useState<number[]>([]);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [rewrittenContents, setRewrittenContents] = useState<Record<number, string>>({});
  const [history, setHistory] = useState<StepResult[]>([]);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [semanticReports, setSemanticReports] = useState<SemanticReport[]>([]);
  const [resultText, setResultText] = useState('');
  const [error, setError] = useState('');

  const parseArticle = useCallback((text: string) => {
    const parts = text.split('\n\n').filter((p) => p.trim());
    setParagraphs(parts.map((content, i) => ({
      index: i,
      content: content.trim(),
      status: 'original' as const,
    })));
  }, []);

  const loadArticle = useCallback((text: string) => {
    setArticleText(text);
    parseArticle(text);
    setPhase('ready');
    resetState();
  }, [parseArticle]);

  const toggleTarget = useCallback((index: number) => {
    setTargetIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index].sort((a, b) => a - b)
    );
  }, []);

  const resetState = useCallback(() => {
    setConfirmedIndices([]);
    setCurrentParagraphIndex(null);
    setCandidates([]);
    setRewrittenContents({});
    setHistory([]);
    setValidation(null);
    setSemanticReports([]);
    setResultText('');
    setError('');
  }, []);

  // Mode 1: Auto rewrite
  const runAuto = useCallback(async () => {
    if (targetIndices.length === 0) {
      setError('请至少选择一个目标段落');
      return;
    }

    setPhase('rewriting');
    setError('');

    try {
      const res = await fetch(`${API_BASE}/rewrite/auto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_text: articleText, target_indices: targetIndices }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      setHistory(data.history || []);
      setValidation(data.validation);
      setSemanticReports(data.semantic_reports || []);

      if (data.rewritten && data.rewritten.paragraphs) {
        setResultText(data.rewritten.paragraphs.map((p: Paragraph) => p.content).join('\n\n'));
        const contents: Record<number, string> = {};
        for (const step of data.history || []) {
          contents[step.paragraph_index] = step.rewritten;
        }
        setRewrittenContents(contents);
      }

      setPhase('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setPhase('ready');
    }
  }, [articleText, targetIndices]);

  // Mode 2: Interactive
  const startInteractive = useCallback(async () => {
    if (targetIndices.length === 0) {
      setError('请至少选择一个目标段落');
      return;
    }

    setPhase('generating_candidates');
    setError('');
    resetState();

    try {
      const res = await fetch(`${API_BASE}/rewrite/interactive/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_text: articleText, target_indices: targetIndices }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const sessionId = data.session_id;

      // Load first paragraph's candidates
      const idx = data.next_paragraph_index;
      setCurrentParagraphIndex(idx);
      await fetchCandidates(sessionId, idx);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setPhase('ready');
    }
  }, [articleText, targetIndices]);

  const fetchCandidates = useCallback(async (sessionId: string, paragraphIndex: number) => {
    setPhase('generating_candidates');

    try {
      const res = await fetch(
        `${API_BASE}/rewrite/interactive/${sessionId}/candidates`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paragraph_index: paragraphIndex }),
        },
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      setCandidates(data.candidates);
      setPhase('waiting_selection');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setPhase('ready');
    }
  }, []);

  const selectCandidate = useCallback(async (candidateIndex: number) => {
    if (currentParagraphIndex === null) return;

    setPhase('generating_candidates');
    const chosen = candidates[candidateIndex];
    setRewrittenContents((prev) => ({ ...prev, [currentParagraphIndex]: chosen }));
    setConfirmedIndices((prev) => [...prev, currentParagraphIndex]);

    try {
      const sessionId = localStorage.getItem('rewrite_session_id') || '';
      const res = await fetch(
        `${API_BASE}/rewrite/interactive/${sessionId}/select`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paragraph_index: currentParagraphIndex,
            candidate_index: candidateIndex,
          }),
        },
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.done) {
        setPhase('done');
        setResultText(data.article_text);
        setCurrentParagraphIndex(null);
      } else {
        const nextIdx = data.next_paragraph_index;
        setCurrentParagraphIndex(nextIdx);
        setCandidates([]);
        await fetchCandidates(sessionId, nextIdx);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setPhase('ready');
    }
  }, [currentParagraphIndex, candidates]);

  const regenerateCandidates = useCallback(async () => {
    if (currentParagraphIndex === null) return;

    try {
      const sessionId = localStorage.getItem('rewrite_session_id') || '';
      const res = await fetch(
        `${API_BASE}/rewrite/interactive/${sessionId}/candidates?regenerate=true`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paragraph_index: currentParagraphIndex }),
        },
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      setCandidates(data.candidates);
      setPhase('waiting_selection');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  }, [currentParagraphIndex]);

  const skipParagraph = useCallback(() => {
    if (currentParagraphIndex === null) return;
    const originalContent = paragraphs[currentParagraphIndex]?.content || '';
    setRewrittenContents((prev) => ({ ...prev, [currentParagraphIndex]: originalContent }));
    setConfirmedIndices((prev) => [...prev, currentParagraphIndex]);

    // Move to next
    const remaining = targetIndices.filter(
      (i) => ![...confirmedIndices, currentParagraphIndex!].includes(i)
    );
    if (remaining.length > 0) {
      setCurrentParagraphIndex(remaining[0]);
      setCandidates([]);
      setPhase('generating_candidates');
    } else {
      setPhase('done');
      setCurrentParagraphIndex(null);
    }
  }, [currentParagraphIndex, targetIndices, confirmedIndices, paragraphs]);

  return {
    mode, setMode,
    phase,
    articleText, setArticleText,
    paragraphs, setParagraphs,
    targetIndices, toggleTarget,
    confirmedIndices,
    currentParagraphIndex,
    candidates,
    rewrittenContents,
    history,
    validation,
    semanticReports,
    resultText,
    error,
    loadArticle,
    parseArticle,
    runAuto,
    startInteractive,
    selectCandidate,
    regenerateCandidates,
    skipParagraph,
    resetState,
  };
}
