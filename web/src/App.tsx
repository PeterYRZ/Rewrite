import { useState } from 'react';
import { useRewriteSession } from './hooks/useRewriteSession';
import ArticleView from './components/ArticleView';
import CandidatePicker from './components/CandidatePicker';
import ModeSelector from './components/ModeSelector';
import type { ValidationReport, SemanticReport } from './types';

export default function App() {
  const [inputText, setInputText] = useState('');
  const session = useRewriteSession();

  const handleLoadArticle = () => {
    if (!inputText.trim()) return;
    session.loadArticle(inputText);
  };

  const handleRunAuto = () => {
    session.runAuto();
  };

  const handleStartInteractive = () => {
    session.startInteractive();
  };

  const isRunning = session.phase === 'rewriting' || session.phase === 'generating_candidates';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800">全文段落改写</h1>
          <ModeSelector
            mode={session.mode}
            onChange={session.setMode}
            disabled={isRunning}
          />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {session.phase === 'idle' && (
          <InputSection
            text={inputText}
            onChange={setInputText}
            onLoad={handleLoadArticle}
          />
        )}

        {session.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {session.error}
          </div>
        )}

        {(session.phase === 'ready' || session.phase === 'done') && (
          <>
            {session.phase === 'ready' && (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg text-sm">
                点击段落卡片选择要改写的段落（蓝色标记）
              </div>
            )}

            <section>
              <h2 className="text-lg font-semibold text-slate-700 mb-3">
                {session.phase === 'done' ? '改写结果' : '文章段落'}
              </h2>
              <ArticleView
                paragraphs={session.paragraphs}
                targetIndices={session.targetIndices}
                confirmedIndices={session.confirmedIndices}
                currentParagraphIndex={session.currentParagraphIndex}
                rewrittenContents={
                  session.phase === 'done' ? session.rewrittenContents : {}
                }
                onParagraphClick={session.phase === 'ready' ? session.toggleTarget : undefined}
              />
            </section>

            {session.phase === 'ready' && (
              <div className="flex gap-3 items-center">
                <span className="text-sm text-slate-500">
                  已选:{' '}
                  {session.targetIndices.length > 0
                    ? session.targetIndices.map((i) => `段落${i + 1}`).join(', ')
                    : '无'}
                </span>
                <button
                  onClick={session.mode === 'auto' ? handleRunAuto : handleStartInteractive}
                  disabled={isRunning || session.targetIndices.length === 0}
                  className="px-6 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  {session.mode === 'auto' ? '开始全自动改写' : '开始交互式改写'}
                </button>
              </div>
            )}

            {session.phase === 'done' && (
              <>
                <ValidationSection validation={session.validation} />
                <SemanticSection reports={session.semanticReports} />
                <ResultSection text={session.resultText} />

                <button
                  onClick={() => {
                    session.resetState();
                    session.setArticleText('');
                  }}
                  className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  重新开始
                </button>
              </>
            )}
          </>
        )}

        {session.phase === 'waiting_selection' && session.currentParagraphIndex !== null && (
          <CandidatePicker
            candidates={session.candidates}
            paragraphIndex={session.currentParagraphIndex}
            onSelect={session.selectCandidate}
            onRegenerate={session.regenerateCandidates}
            onSkip={session.skipParagraph}
            loading={false}
          />
        )}

        {session.phase === 'generating_candidates' && (
          <div className="bg-white rounded-xl border-2 border-amber-300 p-8 text-center shadow-lg">
            <div className="animate-spin h-8 w-8 border-3 border-amber-400 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-slate-500">
              正在为段落 {(session.currentParagraphIndex ?? 0) + 1} 生成改写候选...
            </p>
          </div>
        )}

        {session.phase === 'rewriting' && (
          <div className="bg-white rounded-xl border-2 border-blue-300 p-8 text-center shadow-lg">
            <div className="animate-spin h-8 w-8 border-3 border-blue-400 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-slate-500">正在改写指定段落...</p>
          </div>
        )}
      </main>
    </div>
  );
}

function InputSection({
  text,
  onChange,
  onLoad,
}: {
  text: string;
  onChange: (t: string) => void;
  onLoad: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-700">输入文章</h2>
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="在此粘贴文章，段落之间用空行分隔..."
        className="w-full h-48 p-4 border border-slate-200 rounded-lg text-sm resize-y focus:ring-2 focus:ring-slate-400 focus:border-transparent outline-none"
      />
      <button
        onClick={onLoad}
        disabled={!text.trim()}
        className="px-6 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
      >
        加载文章
      </button>
    </div>
  );
}

function ValidationSection({ validation }: { validation: ValidationReport | null }) {
  if (!validation) return null;

  const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-700 mb-3">质量评估</h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <ScoreRow label="逻辑连贯性" score={validation.coherence} stars={stars(validation.coherence)} />
        <ScoreRow label="段落衔接" score={validation.transition} stars={stars(validation.transition)} />
        <ScoreRow label="语义一致性" score={validation.consistency} stars={stars(validation.consistency)} />
        <ScoreRow label="风格统一性" score={validation.style} stars={stars(validation.style)} />
      </div>
      <div className="mt-3 text-sm text-slate-600">
        综合均分:{' '}
        <span className="font-bold text-slate-800">
          {(typeof validation.average_score === 'number'
            ? validation.average_score
            : (validation.coherence + validation.transition + validation.consistency + validation.style) / 4
          ).toFixed(1)}/5
        </span>
      </div>
      {validation.issues && validation.issues.length > 0 && (
        <ul className="mt-2 text-sm text-amber-700 list-disc list-inside">
          {validation.issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}
      {validation.overall && (
        <p className="mt-2 text-sm text-slate-500">{validation.overall}</p>
      )}
    </div>
  );
}

function ScoreRow({ label, score, stars }: { label: string; score: number; stars: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-amber-600">
        {stars} <span className="text-slate-400 ml-1">{score}/5</span>
      </span>
    </div>
  );
}

function SemanticSection({ reports }: { reports: SemanticReport[] }) {
  if (!reports || reports.length === 0) return null;

  const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-700 mb-3">语义相似度分析</h3>
      <div className="space-y-2">
        {reports.map((r) => (
          <div key={r.paragraph_index} className="text-sm">
            <span className="font-medium text-slate-700">段落 {r.paragraph_index + 1}</span>
            <span className="text-amber-600 ml-2">
              {stars(r.similarity)} {r.similarity}/5
            </span>
            <p className="text-slate-500 mt-0.5">{r.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultSection({ text }: { text: string }) {
  if (!text) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-700 mb-3">修改后的全文</h3>
      <div className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}
