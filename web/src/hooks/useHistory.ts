import { useState, useCallback } from 'react';
import type { SessionState } from '../types';

const STORAGE_KEY = 'rewrite-history';

export interface HistoryEntry {
  id: string;
  title: string;
  articleText: string;
  roundCount: number;
  createdAt: string;
  updatedAt: string;
  sessionState: SessionState;
}

function loadEntries(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: HistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

const DEFAULT_TITLE = '未命名文章';

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(loadEntries);

  const saveSession = useCallback((sessionState: SessionState) => {
    const text = sessionState.current_article?.text || '';
    const autoTitle = text.slice(0, 50).replace(/\n/g, ' ').trim();

    const existing = loadEntries().find((e) => e.id === sessionState.session_id);
    const now = new Date().toISOString();

    if (existing) {
      const updated = loadEntries().map((e) =>
        e.id === sessionState.session_id
          ? {
              ...e,
              articleText: text,
              roundCount: sessionState.round_count,
              updatedAt: now,
              sessionState,
            }
          : e,
      );
      saveEntries(updated);
      setEntries(updated);
    } else {
      const entry: HistoryEntry = {
        id: sessionState.session_id,
        title: autoTitle || DEFAULT_TITLE,
        articleText: text,
        roundCount: sessionState.round_count,
        createdAt: now,
        updatedAt: now,
        sessionState,
      };
      const updated = [entry, ...loadEntries()];
      saveEntries(updated);
      setEntries(updated);
    }
  }, []);

  const renameEntry = useCallback((id: string, title: string) => {
    const updated = loadEntries().map((e) =>
      e.id === id ? { ...e, title: title.trim() || DEFAULT_TITLE } : e,
    );
    saveEntries(updated);
    setEntries(updated);
  }, []);

  const deleteEntry = useCallback((id: string) => {
    const updated = loadEntries().filter((e) => e.id !== id);
    saveEntries(updated);
    setEntries(updated);
  }, []);

  const reload = useCallback(() => setEntries(loadEntries()), []);

  return {
    entries,
    saveSession,
    renameEntry,
    deleteEntry,
    reload,
  };
}
