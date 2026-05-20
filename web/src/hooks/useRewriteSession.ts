import { useState, useCallback } from 'react';
import type { SessionState, RewritePhase, ValidationReport, SemanticReport } from '../types';

const API_BASE = '/api';

function authHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function useRewriteSession(token: string) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<RewritePhase>('idle');
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [semanticReports, setSemanticReports] = useState<SemanticReport[]>([]);
  const [resultText, setResultText] = useState('');

  // ---- Session lifecycle ----

  const createSession = useCallback(async (articleText: string) => {
    setError('');
    try {
      const res = await fetch(`${API_BASE}/rewrite/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ article_text: articleText }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSessionId(data.session_id);
      setSessionState({
        session_id: data.session_id,
        current_article: { paragraphs: data.paragraphs, text: articleText },
        rounds: [],
        active_round: null,
        round_count: 0,
      });
      setPhase('ready');
      return data.session_id;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create session');
      return null;
    }
  }, [token]);

  const startRound = useCallback(async (targetIndices: number[]) => {
    if (!sessionId) return null;
    setError('');

    try {
      const res = await fetch(
        `${API_BASE}/rewrite/session/${sessionId}/start-round`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify({ target_indices: targetIndices }),
        },
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSessionState((prev) =>
        prev
          ? {
              ...prev,
              current_article: {
                paragraphs: data.paragraphs,
                text: prev.current_article.text,
              },
              active_round: {
                round_num: data.round_num,
                target_indices: data.target_indices,
                results: {},
              },
            }
          : prev,
      );
      return data;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start round');
      return null;
    }
  }, [sessionId, token]);

  const recordResult = useCallback(
    async (paragraphIndex: number, content: string) => {
      if (!sessionId) return;
      setError('');

      try {
        await fetch(`${API_BASE}/rewrite/session/${sessionId}/record`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify({ paragraph_index: paragraphIndex, content }),
        });

        setSessionState((prev) => {
          if (!prev || !prev.active_round) return prev;
          return {
            ...prev,
            active_round: {
              ...prev.active_round,
              results: { ...prev.active_round.results, [paragraphIndex]: content },
            },
          };
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to record result');
      }
    },
    [sessionId, token],
  );

  const commitRound = useCallback(async () => {
    if (!sessionId) return null;
    setError('');

    try {
      const res = await fetch(
        `${API_BASE}/rewrite/session/${sessionId}/commit`,
        { method: 'POST', headers: { ...authHeaders(token) } },
      );

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSessionState((prev) =>
        prev
          ? {
              ...prev,
              current_article: {
                paragraphs: data.paragraphs,
                text: data.text,
              },
              rounds: [
                ...prev.rounds,
                {
                  round_num: data.committed_round,
                  target_indices: [],
                  results: data.committed_results,
                  committed: true,
                },
              ],
              active_round: null,
              round_count: data.round_count,
            }
          : prev,
      );
      setResultText(data.text);
      setPhase('done');
      return data;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to commit round');
      return null;
    }
  }, [sessionId, token]);

  const fetchSessionStatus = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`${API_BASE}/rewrite/session/${sessionId}`, {
        headers: { ...authHeaders(token) },
      });
      if (res.ok) {
        const data: SessionState = await res.json();
        setSessionState(data);
      }
    } catch {
      // silent
    }
  }, [sessionId, token]);

  // ---- Legacy: auto mode ----

  const runAuto = useCallback(
    async (articleText: string, targetIndices: number[]) => {
      setError('');
      setPhase('streaming');
      try {
        const res = await fetch(`${API_BASE}/rewrite/auto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
          body: JSON.stringify({ article_text: articleText, target_indices: targetIndices }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        setResultText(data.rewritten?.text || '');
        setValidation(data.validation);
        setSemanticReports(data.semantic_reports || []);
        setPhase('done');
        return data;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Auto rewrite failed');
        setPhase('ready');
        return null;
      }
    },
    [token],
  );

  const reset = useCallback(() => {
    setSessionId(null);
    setPhase('idle');
    setSessionState(null);
    setError('');
    setValidation(null);
    setSemanticReports([]);
    setResultText('');
  }, []);

  return {
    sessionId,
    phase,
    setPhase,
    sessionState,
    error,
    validation,
    semanticReports,
    resultText,
    createSession,
    startRound,
    recordResult,
    commitRound,
    fetchSessionStatus,
    runAuto,
    reset,
  };
}
