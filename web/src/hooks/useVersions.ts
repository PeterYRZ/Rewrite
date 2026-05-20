import { useState, useCallback } from 'react';
import type { ParagraphVersion } from '../types';

const STORAGE_PREFIX = 'rw-versions';

function storageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}-${sessionId}`;
}

function loadVersions(sessionId: string): ParagraphVersion[] {
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveVersions(sessionId: string, versions: ParagraphVersion[]) {
  localStorage.setItem(storageKey(sessionId), JSON.stringify(versions));
}

export function useVersions(sessionId: string | null) {
  const [versions, setVersions] = useState<ParagraphVersion[]>([]);

  const load = useCallback(() => {
    if (!sessionId) return;
    setVersions(loadVersions(sessionId));
  }, [sessionId]);

  const addVersion = useCallback(
    (paraIndex: number, content: string, roundNumber: number) => {
      if (!sessionId) return;
      const all = loadVersions(sessionId);
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
      saveVersions(sessionId, all);
      setVersions(all);
    },
    [sessionId],
  );

  const updateLabel = useCallback(
    (versionId: string, label: string) => {
      if (!sessionId) return;
      const all = loadVersions(sessionId).map((v) =>
        v.versionId === versionId ? { ...v, label } : v,
      );
      saveVersions(sessionId, all);
      setVersions(all);
    },
    [sessionId],
  );

  const getVersionsForParagraph = useCallback(
    (paraIndex: number): ParagraphVersion[] => {
      const all = sessionId ? loadVersions(sessionId) : [];
      return all
        .filter((v) => v.paragraphIndex === paraIndex)
        .sort((a, b) => b.roundNumber - a.roundNumber);
    },
    [sessionId],
  );

  return {
    versions,
    load,
    addVersion,
    updateLabel,
    getVersionsForParagraph,
  };
}
