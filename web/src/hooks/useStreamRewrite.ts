import { useState, useCallback, useRef } from 'react';

export interface StreamCallbacks {
  onParagraphStart?: (paraIndex: number) => void;
  onToken?: (paraIndex: number, token: string) => void;
  onParagraphProgress?: (paraIndex: number, tokensSoFar: number, originalLength: number) => void;
  onParagraphDone?: (paraIndex: number, content: string) => void;
  onParagraphError?: (paraIndex: number, error: string) => void;
  onAllDone?: () => void;
}

const API_BASE = '/api';

export function useStreamRewrite() {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef<Set<number>>(new Set());

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const stopParagraph = useCallback((paraIndex: number) => {
    stoppedRef.current = new Set([...stoppedRef.current, paraIndex]);
  }, []);

  const clearStoppedParagraphs = useCallback(() => {
    stoppedRef.current = new Set();
  }, []);

  const removeStoppedParagraph = useCallback((paraIndex: number) => {
    const next = new Set(stoppedRef.current);
    next.delete(paraIndex);
    stoppedRef.current = next;
  }, []);

  const streamRewrite = useCallback(
    async (
      articleText: string,
      targetIndices: number[],
      callbacks: StreamCallbacks,
    ) => {
      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`${API_BASE}/rewrite/stream/rewrite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ article_text: articleText, target_indices: targetIndices }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // keep incomplete line in buffer

          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              try {
                const data = JSON.parse(dataStr);
                switch (eventType) {
                  case 'paragraph_start':
                    if (!stoppedRef.current.has(data.paragraph_index)) {
                      callbacks.onParagraphStart?.(data.paragraph_index);
                    }
                    break;
                  case 'token':
                    if (!stoppedRef.current.has(data.paragraph_index)) {
                      callbacks.onToken?.(data.paragraph_index, data.token);
                    }
                    break;
                  case 'paragraph_progress':
                    if (!stoppedRef.current.has(data.paragraph_index)) {
                      callbacks.onParagraphProgress?.(data.paragraph_index, data.tokens_so_far, data.original_length);
                    }
                    break;
                  case 'paragraph_done':
                    if (!stoppedRef.current.has(data.paragraph_index)) {
                      callbacks.onParagraphDone?.(data.paragraph_index, data.content);
                    }
                    break;
                  case 'paragraph_error':
                    if (!stoppedRef.current.has(data.paragraph_index)) {
                      callbacks.onParagraphError?.(data.paragraph_index, data.error);
                    }
                    break;
                  case 'stream_end':
                    callbacks.onAllDone?.();
                    break;
                }
              } catch {
                // skip malformed JSON
              }
            }
          }
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          return; // intentionally cancelled
        }
        throw e;
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [],
  );

  const streamRegenerate = useCallback(
    async (
      articleText: string,
      paragraphIndex: number,
      targetIndices: number[],
      confirmedContents: Record<string, string>,
      guidance: string,
      callbacks: StreamCallbacks,
    ) => {
      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`${API_BASE}/rewrite/stream/regenerate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            article_text: articleText,
            paragraph_index: paragraphIndex,
            target_indices: targetIndices,
            confirmed_contents: confirmedContents,
            guidance,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              try {
                const data = JSON.parse(dataStr);
                switch (eventType) {
                  case 'paragraph_start':
                    if (!stoppedRef.current.has(data.paragraph_index)) {
                      callbacks.onParagraphStart?.(data.paragraph_index);
                    }
                    break;
                  case 'token':
                    if (!stoppedRef.current.has(data.paragraph_index)) {
                      callbacks.onToken?.(data.paragraph_index, data.token);
                    }
                    break;
                  case 'paragraph_progress':
                    if (!stoppedRef.current.has(data.paragraph_index)) {
                      callbacks.onParagraphProgress?.(data.paragraph_index, data.tokens_so_far, data.original_length);
                    }
                    break;
                  case 'paragraph_done':
                    if (!stoppedRef.current.has(data.paragraph_index)) {
                      callbacks.onParagraphDone?.(data.paragraph_index, data.content);
                    }
                    break;
                  case 'paragraph_error':
                    if (!stoppedRef.current.has(data.paragraph_index)) {
                      callbacks.onParagraphError?.(data.paragraph_index, data.error);
                    }
                    break;
                  case 'stream_end':
                    callbacks.onAllDone?.();
                    break;
                }
              } catch {
                // skip
              }
            }
          }
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          return;
        }
        throw e;
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [],
  );

  return {
    streamRewrite,
    streamRegenerate,
    isStreaming,
    cancel,
    stopParagraph,
    clearStoppedParagraphs,
    removeStoppedParagraph,
  };
}
