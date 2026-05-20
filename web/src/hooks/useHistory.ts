import { useState, useCallback, useEffect, useRef } from 'react';
import type { SessionState } from '../types';

const STORAGE_PREFIX = 'rw-history';

function storageKey(username: string): string {
  return `${STORAGE_PREFIX}-${username}`;
}

function loadEntries(username: string): HistoryEntry[] {
  if (!username) return [];
  try {
    const raw = localStorage.getItem(storageKey(username));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEntries(username: string, entries: HistoryEntry[]) {
  if (!username) return;
  localStorage.setItem(storageKey(username), JSON.stringify(entries));
}

export interface HistoryEntry {
  id: string;
  title: string;
  articleText: string;
  roundCount: number;
  createdAt: string;
  updatedAt: string;
  sessionState: SessionState;
}

const DEFAULT_TITLE = '未命名文章';

export function useHistory(username: string) {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => loadEntries(username));
  const prevUsername = useRef(username);

  // Reload entries when username changes (different user logs in)
  useEffect(() => {
    if (prevUsername.current !== username) {
      prevUsername.current = username;
      setEntries(loadEntries(username));
    }
  }, [username]);

  const saveSession = useCallback((sessionState: SessionState) => {
    const text = sessionState.current_article?.text || '';
    const autoTitle = text.slice(0, 50).replace(/\n/g, ' ').trim();
    const now = new Date().toISOString();

    const all = loadEntries(username);

    // Dedup: remove any existing entry with the same session_id before adding
    const filtered = all.filter((e) => e.id !== sessionState.session_id);
    const existed = all.find((e) => e.id === sessionState.session_id);

    const entry: HistoryEntry = existed
      ? {
          ...existed,
          articleText: text,
          roundCount: sessionState.round_count,
          updatedAt: now,
          sessionState,
          // keep original title if user renamed it
          title: existed.title !== DEFAULT_TITLE && existed.title !== existed.articleText.slice(0, 50).replace(/\n/g, ' ').trim()
            ? existed.title
            : (autoTitle || DEFAULT_TITLE),
        }
      : {
          id: sessionState.session_id,
          title: autoTitle || DEFAULT_TITLE,
          articleText: text,
          roundCount: sessionState.round_count,
          createdAt: now,
          updatedAt: now,
          sessionState,
        };

    const updated = [entry, ...filtered];
    saveEntries(username, updated);
    setEntries(updated);
  }, [username]);

  const renameEntry = useCallback((id: string, title: string) => {
    const updated = loadEntries(username).map((e) =>
      e.id === id ? { ...e, title: title.trim() || DEFAULT_TITLE } : e,
    );
    saveEntries(username, updated);
    setEntries(updated);
  }, [username]);

  const deleteEntry = useCallback((id: string) => {
    const updated = loadEntries(username).filter((e) => e.id !== id);
    saveEntries(username, updated);
    setEntries(updated);
  }, [username]);

  const reload = useCallback(() => setEntries(loadEntries(username)), [username]);

  return {
    entries,
    saveSession,
    renameEntry,
    deleteEntry,
    reload,
  };
}
