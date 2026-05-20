import { useState, useCallback, useEffect, useRef } from 'react';

export interface DebugLogEntry {
  id: number;
  timestamp: string;
  type: string;
  data: unknown;
}

const MAX_LOG_ENTRIES = 500;

export function useDebug() {
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [sseLog, setSseLog] = useState<DebugLogEntry[]>([]);
  const [backendLogs, setBackendLogs] = useState<string[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIsDebugMode(params.get('debug') === 'true');
  }, []);

  const addLogEntry = useCallback((type: string, data: unknown) => {
    const entry: DebugLogEntry = {
      id: idRef.current++,
      timestamp: new Date().toISOString().slice(11, 23),
      type,
      data,
    };
    setSseLog((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_LOG_ENTRIES
        ? next.slice(next.length - MAX_LOG_ENTRIES)
        : next;
    });
  }, []);

  const clearLogs = useCallback(() => {
    setSseLog([]);
    idRef.current = 0;
  }, []);

  const fetchBackendLogs = useCallback(async (token?: string) => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/debug/logs?lines=100`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setBackendLogs(data.lines || []);
    } catch {
      // silent
    }
  }, []);

  return {
    isDebugMode,
    sseLog,
    backendLogs,
    addLogEntry,
    clearLogs,
    fetchBackendLogs,
  };
}
