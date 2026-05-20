import { useState, useCallback } from 'react';
import type { ParagraphVersion } from '../types';

const STORAGE_PREFIX = 'rw-versions';

function storageKey(sessionId: string, username: string): string {
  return `${STORAGE_PREFIX}-${username}-${sessionId}`;
}

function loadVersions(sessionId: string, username: string): ParagraphVersion[] {
  try {
    const raw = localStorage.getItem(storageKey(sessionId, username));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveVersions(sessionId: string, username: string, versions: ParagraphVersion[]) {
  localStorage.setItem(storageKey(sessionId, username), JSON.stringify(versions));
}

export function useVersions(sessionId: string | null, username: string) {
  const [versions, setVersions] = useState<ParagraphVersion[]>([]);

  const load = useCallback(() => {
    if (!sessionId) return;
    setVersions(loadVersions(sessionId, username));
  }, [sessionId, username]);

  const addVersion = useCallback(
    (paraIndex: number, content: string, roundNumber: number) => {
      if (!sessionId) return;
      const all = loadVersions(sessionId, username);
      const version: ParagraphVersion = {
        versionId: `${sessionId}-p${paraIndex}-r${roundNumber}-${Date.now()}`,
        paragraphIndex: paraIndex,
        sessionId,
        content,
        roundNumber,
        createdAt: new Date().toISOString(),
        label: `Round ${roundNumber}`,
      };
      all.push(version);
      saveVersions(sessionId, username, all);
      setVersions(all);
    },
    [sessionId, username],
  );

  const updateLabel = useCallback(
    (versionId: string, label: string) => {
      if (!sessionId) return;
      const all = loadVersions(sessionId, username).map((v) =>
        v.versionId === versionId ? { ...v, label } : v,
      );
      saveVersions(sessionId, username, all);
      setVersions(all);
    },
    [sessionId, username],
  );

  const getVersionsForParagraph = useCallback(
    (paraIndex: number): ParagraphVersion[] => {
      const all = sessionId ? loadVersions(sessionId, username) : [];
      return all
        .filter((v) => v.paragraphIndex === paraIndex)
        .sort((a, b) => b.roundNumber - a.roundNumber);
    },
    [sessionId, username],
  );

  return {
    versions,
    load,
    addVersion,
    updateLabel,
    getVersionsForParagraph,
  };
}
