import { useTranslation } from '../i18n/I18nContext';

interface Props {
  onClose: () => void;
}

export default function AboutPage({ onClose }: Props) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-20 overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 p-6 shadow-sm mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-700">
            {t('about.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            ✕ {t('about.close')}
          </button>
        </div>

        <div className="space-y-4 text-sm">
          {/* App name */}
          <div>
            <h3 className="text-xl font-bold text-slate-800">
              {t('header.title')}
            </h3>
            <p className="text-slate-500 mt-0.5">Paragraph Rewriter</p>
          </div>

          {/* Info table */}
          <div className="border-t border-slate-100 pt-4 space-y-2">
            <InfoRow label={t('about.version')} value={__APP_VERSION__} />
            <InfoRow label={t('about.buildDate')} value={__BUILD_DATE__} />
            <InfoRow
              label={t('about.developer')}
              value="余任之"
            />
          </div>

          {/* GitHub link */}
          <div className="border-t border-slate-100 pt-4">
            <a
              href="https://github.com/PeterYRZ/Rewrite"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-700 underline"
            >
              GitHub Repository →
            </a>
          </div>

          {/* Tech stack */}
          <div className="border-t border-slate-100 pt-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">
              {t('about.techStack')}
            </h4>
            <div className="flex flex-wrap gap-1.5">
              <Badge>Python 3.14</Badge>
              <Badge>FastAPI</Badge>
              <Badge>React 19</Badge>
              <Badge>Vite</Badge>
              <Badge>Tailwind CSS</Badge>
              <Badge>SSE</Badge>
              <Badge>OpenAI</Badge>
              <Badge>Ollama</Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-700 font-mono">{value}</span>
    </div>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-mono">
      {children}
    </span>
  );
}
