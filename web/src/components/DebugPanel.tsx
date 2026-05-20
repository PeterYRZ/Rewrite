import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../i18n/I18nContext';
import type { DebugLogEntry } from '../hooks/useDebug';

type TabId = 'session' | 'events' | 'logs';

interface Props {
  isDebugMode: boolean;
  sessionId: string | null;
  phase: string;
  targetIndices: number[];
  confirmedIndices: number[];
  roundCount: number;
  sseLog: DebugLogEntry[];
  backendLogs: string[];
  onFetchBackendLogs: () => void;
  onClearLogs: () => void;
}

const eventColors: Record<string, string> = {
  paragraph_start: 'bg-green-100 text-green-700',
  token: 'bg-gray-100 text-gray-600',
  paragraph_progress: 'bg-blue-100 text-blue-700',
  paragraph_done: 'bg-emerald-100 text-emerald-700',
  paragraph_error: 'bg-red-100 text-red-700',
  stream_end: 'bg-purple-100 text-purple-700',
  user_stop: 'bg-orange-100 text-orange-700',
  user_cancel_all: 'bg-red-100 text-red-700',
};

export default function DebugPanel({
  isDebugMode,
  sessionId,
  phase,
  targetIndices,
  confirmedIndices,
  roundCount,
  sseLog,
  backendLogs,
  onFetchBackendLogs,
  onClearLogs,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabId>('events');
  const eventsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll events
  useEffect(() => {
    if (open && tab === 'events') {
      eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sseLog, open, tab]);

  // Auto-refresh backend logs during streaming
  useEffect(() => {
    if (!open) return;
    if (phase === 'streaming') {
      const interval = setInterval(onFetchBackendLogs, 3000);
      return () => clearInterval(interval);
    }
  }, [open, phase, onFetchBackendLogs]);

  // Load logs when panel opens
  useEffect(() => {
    if (open) onFetchBackendLogs();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isDebugMode) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'session', label: 'Session' },
    { id: 'events', label: `Events (${sseLog.length})` },
    { id: 'logs', label: 'Logs' },
  ];

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-4 right-4 w-11 h-11 rounded-full shadow-lg z-40 flex items-center justify-center text-lg cursor-pointer transition-colors ${
          open ? 'bg-slate-700 text-white' : 'bg-slate-600 text-white hover:bg-slate-700'
        }`}
        title="Debug Panel"
      >
        🐛
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-96 max-w-[90vw] bg-white shadow-2xl z-50 transform transition-transform duration-300 overflow-hidden flex flex-col ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-700">Debug Panel</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs font-medium cursor-pointer ${
                tab === t.id
                  ? 'text-slate-700 border-b-2 border-slate-700 bg-white'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
          <div className="flex-1" />
          {tab === 'events' && (
            <button
              onClick={onClearLogs}
              className="px-2 py-2 text-xs text-slate-400 hover:text-red-500 cursor-pointer"
            >
              {t('debug.clear')}
            </button>
          )}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-3">
          {tab === 'session' && (
            <div className="space-y-2 text-xs">
              <SessionRow label="session_id" value={sessionId || '-'} />
              <SessionRow label="phase" value={phase} />
              <SessionRow label="round_count" value={String(roundCount)} />
              <SessionRow label="target_indices" value={JSON.stringify(targetIndices)} />
              <SessionRow label="confirmed_indices" value={JSON.stringify(confirmedIndices)} />
              <SessionRow label="completed" value={`${confirmedIndices.length}/${targetIndices.length || '-'}`} />
            </div>
          )}

          {tab === 'events' && (
            <div className="space-y-1 font-mono text-xs">
              {sseLog.length === 0 && (
                <p className="text-slate-400 italic">{t('debug.waitingEvents')}</p>
              )}
              {sseLog.map((entry) => {
                const badge = eventColors[entry.type] || 'bg-gray-100 text-gray-600';
                return (
                  <div key={entry.id} className="flex items-start gap-1.5 py-0.5 border-b border-slate-50">
                    <span className="text-slate-400 shrink-0">{entry.timestamp}</span>
                    <span className={`px-1 py-0.5 rounded text-[10px] font-medium shrink-0 ${badge}`}>
                      {entry.type}
                    </span>
                    <span className="text-slate-500 truncate">
                      {JSON.stringify(entry.data).slice(0, 80)}
                    </span>
                  </div>
                );
              })}
              <div ref={eventsEndRef} />
            </div>
          )}

          {tab === 'logs' && (
            <div className="space-y-1 font-mono text-[11px]">
              <button
                onClick={onFetchBackendLogs}
                className="mb-2 px-2 py-1 text-xs bg-slate-100 rounded hover:bg-slate-200 cursor-pointer"
              >
                {t('debug.refresh')}
              </button>
              {backendLogs.length === 0 && (
                <p className="text-slate-400 italic">{t('debug.noLogs')}</p>
              )}
              {backendLogs.map((line, i) => (
                <div key={i} className="text-slate-600 break-all leading-relaxed">
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SessionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-400 shrink-0 w-32">{label}</span>
      <span className="text-slate-700 font-mono break-all">{value}</span>
    </div>
  );
}
