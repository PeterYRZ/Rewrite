import { useState } from 'react';
import { useTranslation } from '../i18n/I18nContext';
import type { HistoryEntry } from '../hooks/useHistory';

interface Props {
  entries: HistoryEntry[];
  onContinue: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onClose?: () => void;
  compact?: boolean;
}

export default function HistoryPage({
  entries,
  onContinue,
  onDelete,
  onRename,
  onClose,
  compact = false,
}: Props) {
  const { t, lang } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const dateLocale = lang === 'en' ? 'en-US' : 'zh-CN';

  const startRename = (entry: HistoryEntry) => {
    setEditingId(entry.id);
    setEditTitle(entry.title);
  };

  const submitRename = (id: string) => {
    onRename(id, editTitle);
    setEditingId(null);
  };

  const containerClass = compact
    ? ''
    : 'bg-white rounded-xl border border-slate-200 p-6 shadow-sm overflow-hidden';

  return (
    <div className={containerClass}>
      {!compact && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-700">{t('history.title')}</h2>
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
              {t('history.close')}
            </button>
          )}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-slate-400 text-sm py-6 text-center">
          {t('history.empty')}
        </p>
      ) : (
        <div className={compact ? 'space-y-2' : 'grid gap-3'}>
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="border border-slate-200 rounded-lg p-3 hover:border-slate-300 transition-colors overflow-hidden"
            >
              <div className="flex items-start justify-between gap-2 w-full">
                <div className="flex-1 min-w-0 overflow-hidden">
                  {editingId === entry.id ? (
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => submitRename(entry.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename(entry.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="w-full p-1 border border-blue-300 rounded text-sm font-medium text-slate-700 outline-none"
                      autoFocus
                    />
                  ) : (
                    <h3
                      className="text-sm font-medium text-slate-700 truncate cursor-pointer hover:text-blue-600"
                      onClick={() => startRename(entry)}
                      title={entry.title}
                    >
                      {entry.title}
                    </h3>
                  )}
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 min-w-0">
                    <span className="flex-shrink-0">{t('history.rounds', { n: entry.roundCount })}</span>
                    <span className="flex-shrink-0">{new Date(entry.updatedAt).toLocaleString(dateLocale)}</span>
                    <span className="truncate min-w-0">
                      {entry.articleText.slice(0, 60).replace(/\n/g, ' ')}...
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => startRename(entry)}
                    className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={t('history.rename')}
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => onContinue(entry)}
                    className="px-3 py-1 text-xs rounded bg-slate-800 text-white hover:bg-slate-700 cursor-pointer"
                  >
                    {t('history.continue')}
                  </button>
                  <button
                    onClick={() => onDelete(entry.id)}
                    className="px-2 py-1 text-xs rounded border border-red-200 text-red-400 hover:text-red-600 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
