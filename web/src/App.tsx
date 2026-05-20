import { useState, useCallback } from 'react';
import { useArticleState } from './hooks/useArticleState';
import { useRewriteSession } from './hooks/useRewriteSession';
import { useStreamRewrite } from './hooks/useStreamRewrite';
import { useConfig } from './hooks/useConfig';
import DiffLayout from './components/DiffLayout';
import ArticlePanel from './components/ArticlePanel';
import RewritePanel from './components/RewritePanel';
import RoundIndicator from './components/RoundIndicator';
import ConfigPanel from './components/ConfigPanel';

export default function App() {
  const [inputText, setInputText] = useState('');

  const article = useArticleState();
  const session = useRewriteSession();
  const stream = useStreamRewrite();
  const configHook = useConfig();

  // Guidance text per paragraph
  const [guidanceMap, setGuidanceMap] = useState<Record<number, string>>({});

  // ---- Load article ----
  const handleLoadArticle = useCallback(async () => {
    if (!inputText.trim()) return;
    article.loadArticle(inputText);
    await session.createSession(inputText);
  }, [inputText, article, session]);

  // ---- Batch rewrite ----
  const handleRewriteSelected = useCallback(async () => {
    if (article.targetIndices.length === 0) return;

    session.setPhase('streaming');

    // Also start a round on the backend
    await session.startRound(article.targetIndices);

    for (const idx of article.targetIndices) {
      article.setCardState(idx, 'streaming');
      article.setRewrittenContent(idx, '');
    }

    await stream.streamRewrite(
      article.articleText,
      article.targetIndices,
      {
        onToken(paraIndex, token) {
          article.appendToken(paraIndex, token);
        },
        onParagraphDone(paraIndex, _content) {
          article.setCardState(paraIndex, 'stream_done');
        },
        onParagraphError(paraIndex, error) {
          article.setRewrittenContent(paraIndex, `[错误] ${error}`);
          article.setCardState(paraIndex, 'stream_done');
        },
        onAllDone() {
          session.setPhase('reviewing');
        },
      },
    );
  }, [article, session, stream]);

  // ---- Per-paragraph actions ----
  const handleAccept = useCallback(
    (paraIndex: number) => {
      article.markConfirmed(paraIndex);
      session.recordResult(paraIndex, article.rewrittenContents[paraIndex] || '');
    },
    [article, session],
  );

  const handleRegenerate = useCallback(
    async (paraIndex: number) => {
      const guidance = guidanceMap[paraIndex] || '';
      article.setCardState(paraIndex, 'regenerating');
      article.setRewrittenContent(paraIndex, '');

      const confirmedContents: Record<string, string> = {};
      for (const idx of article.confirmedIndices) {
        if (idx !== paraIndex) {
          confirmedContents[String(idx)] = article.rewrittenContents[idx] || '';
        }
      }

      await stream.streamRegenerate(
        article.articleText,
        paraIndex,
        article.targetIndices,
        confirmedContents,
        guidance,
        {
          onToken(_pIdx, token) {
            article.appendToken(paraIndex, token);
          },
          onParagraphDone(_pIdx, _content) {
            article.setCardState(paraIndex, 'stream_done');
          },
          onParagraphError(_pIdx, error) {
            article.setRewrittenContent(paraIndex, `[错误] ${error}`);
            article.setCardState(paraIndex, 'stream_done');
          },
          onAllDone() {},
        },
      );

      setGuidanceMap((prev) => {
        const next = { ...prev };
        delete next[paraIndex];
        return next;
      });
    },
    [article, session, stream, guidanceMap],
  );

  const handleStartGuidance = useCallback(
    (paraIndex: number) => {
      article.setCardState(paraIndex, 'guidance_input');
    },
    [article],
  );

  const handleStartEdit = useCallback(
    (paraIndex: number) => {
      article.setCardState(paraIndex, 'editing');
    },
    [article],
  );

  const handleConfirmEdit = useCallback(
    (paraIndex: number, content: string) => {
      article.setRewrittenContent(paraIndex, content);
      article.setCardState(paraIndex, 'stream_done');
    },
    [article],
  );

  // ---- Commit round ----
  const handleCommit = useCallback(async () => {
    const data = await session.commitRound();
    if (data?.paragraphs) {
      article.replaceParagraphs(data.paragraphs);
    }
    article.resetSelection();
    session.setPhase('done');
  }, [session, article]);

  // ---- Start next round ----
  const handleNextRound = useCallback(() => {
    article.resetSelection();
    session.setPhase('ready');
  }, [article, session]);

  // ---- Reset everything ----
  const handleReset = useCallback(() => {
    article.resetSelection();
    session.reset();
    setInputText('');
    setGuidanceMap({});
  }, [article, session]);

  // ---- Derived state ----
  const isIdle = session.phase === 'idle';
  const canRewrite = session.phase === 'ready' && article.targetIndices.length > 0;
  const isStreaming = session.phase === 'streaming';
  const isReviewing = session.phase === 'reviewing';
  const isDone = session.phase === 'done';
  const allConfirmed =
    article.targetIndices.length > 0 &&
    article.targetIndices.every((i) => article.confirmedIndices.includes(i));

  const currentRound = (session.sessionState?.round_count ?? 0) + 1;
  const rounds = session.sessionState?.rounds ?? [];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-slate-800">全文段落改写</h1>
            {!isIdle && (
              <RoundIndicator currentRound={currentRound} rounds={rounds} />
            )}
          </div>
          {configHook.config && (
            <ConfigPanel
              config={configHook.config}
              activeModel={configHook.activeModel}
              loading={configHook.loading}
              onModelChange={(m) => configHook.updateConfig({ model: m })}
              onTemperatureChange={(t) => configHook.updateConfig({ temperature: t })}
            />
          )}
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {isIdle && (
          <div className="max-w-2xl mx-auto bg-white rounded-xl border border-slate-200 p-6 space-y-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-700">输入文章</h2>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="在此粘贴文章，段落之间用空行分隔..."
              className="w-full h-48 p-4 border border-slate-200 rounded-lg text-sm resize-y focus:ring-2 focus:ring-slate-400 outline-none"
            />
            <button
              onClick={handleLoadArticle}
              disabled={!inputText.trim()}
              className="px-6 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
            >
              加载文章
            </button>
            {configHook.error && (
              <p className="text-sm text-red-500">配置加载失败: {configHook.error}</p>
            )}
          </div>
        )}

        {!isIdle && (
          <DiffLayout
            left={
              <ArticlePanel
                title={
                  isDone
                    ? `当前稿 — 第 ${rounds.length} 轮完成`
                    : '当前稿（点击段落选择改写目标）'
                }
                paragraphs={article.paragraphs}
                targetIndices={
                  isStreaming || isReviewing || isDone ? [] : article.targetIndices
                }
                confirmedIndices={isDone ? [] : article.confirmedIndices}
                rewrittenContents={isDone ? article.rewrittenContents : {}}
                selectable={!isStreaming && !isReviewing && !isDone}
                onParagraphClick={
                  !isStreaming && !isReviewing && !isDone
                    ? article.toggleTarget
                    : () => {}
                }
              >
                {session.error && (
                  <p className="text-sm text-red-500 mt-2">{session.error}</p>
                )}
                {isDone && rounds.length > 0 && (
                  <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <p className="text-sm font-medium text-emerald-700">
                      第 {rounds.length} 轮已完成
                    </p>
                    <p className="text-xs text-emerald-600 mt-1">
                      已改写段落：{rounds.flatMap((r) =>
                        Object.keys(r.results).map((k) => `段落${Number(k) + 1}`),
                      ).join(', ')}
                    </p>
                  </div>
                )}
              </ArticlePanel>
            }
            right={
              isStreaming || isReviewing ? (
                <RewritePanel
                  title={`改写结果 — Round ${currentRound}`}
                  paragraphs={article.paragraphs}
                  targetIndices={article.targetIndices}
                  streamedContents={article.rewrittenContents}
                  cardStates={article.cardStates}
                  guidanceMap={guidanceMap}
                  onGuidanceChange={(idx, text) =>
                    setGuidanceMap((prev) => ({ ...prev, [idx]: text }))
                  }
                  onAccept={handleAccept}
                  onRegenerate={handleRegenerate}
                  onStartGuidance={handleStartGuidance}
                  onStartEdit={handleStartEdit}
                  onConfirmEdit={handleConfirmEdit}
                />
              ) : isDone ? (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                    最终结果
                  </h2>
                  <div className="bg-white rounded-lg border border-emerald-200 p-4">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {article.paragraphs.map((p) => p.content).join('\n\n')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-300 text-sm">
                  选择左侧段落，点击下方按钮开始改写
                </div>
              )
            }
          />
        )}
      </main>

      {/* Bottom action bar */}
      {!isIdle && (
        <footer className="bg-white border-t border-slate-200 sticky bottom-0 z-10">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {canRewrite && (
                <button
                  onClick={handleRewriteSelected}
                  className="px-5 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 cursor-pointer"
                >
                  重写选中段落 ({article.targetIndices.length})
                </button>
              )}
              {isStreaming && (
                <span className="text-sm text-amber-600 font-medium">
                  正在改写...
                </span>
              )}
              {isReviewing && allConfirmed && (
                <button
                  onClick={handleCommit}
                  className="px-5 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 cursor-pointer"
                >
                  提交本轮 → 继续下一轮
                </button>
              )}
              {isDone && (
                <>
                  <button
                    onClick={handleNextRound}
                    className="px-5 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 cursor-pointer"
                  >
                    开始下一轮
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    重新开始
                  </button>
                </>
              )}
            </div>

            <div className="text-xs text-slate-400">
              {article.targetIndices.length > 0 && (
                <span>
                  已选: {article.targetIndices.map((i) => i + 1).join(', ')}
                </span>
              )}
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
