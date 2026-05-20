// ---- Shared types ----

export interface Paragraph {
  index: number;
  content: string;
  status: 'original' | 'locked' | 'to_rewrite' | 'rewritten';
}

export interface Article {
  paragraphs: Paragraph[];
}

export interface StepResult {
  paragraph_index: number;
  original: string;
  rewritten: string;
  candidates?: string[];
  chosen_index?: number;
}

export interface ValidationReport {
  coherence: number;
  transition: number;
  consistency: number;
  style: number;
  issues: string[];
  overall: string;
  average_score: number;
}

export interface SemanticReport {
  paragraph_index: number;
  similarity: number;
  summary: string;
}

export interface AutoRewriteResult {
  original: Article;
  rewritten: Article;
  history: StepResult[];
  validation: ValidationReport | null;
  semantic_reports: SemanticReport[];
}

export type Mode = 'auto' | 'interactive';

// ---- Phase 7: SSE Streaming types ----

/** SSE event from the stream/rewrite endpoint */
export interface SSETokenEvent {
  paragraph_index: number;
  token: string;
}

export interface SSEParagraphDoneEvent {
  paragraph_index: number;
  content: string;
}

export interface SSEParagraphErrorEvent {
  paragraph_index: number;
  error: string;
}

/** Per-paragraph rewrite card state */
export type RewriteCardState =
  | 'pending'
  | 'streaming'
  | 'stream_done'
  | 'accepted'
  | 'editing'
  | 'guidance_input'
  | 'regenerating';

/** Overall rewrite phase for the new interactive mode */
export type RewritePhase =
  | 'idle'
  | 'ready'
  | 'streaming'
  | 'reviewing'
  | 'done';

// ---- Phase 7: Session types ----

export interface RewriteRound {
  round_num: number;
  target_indices: number[];
  results: Record<number, string>;
  committed: boolean;
}

export interface SessionState {
  session_id: string;
  current_article: {
    paragraphs: Paragraph[];
    text: string;
  };
  rounds: RewriteRound[];
  active_round: {
    round_num: number;
    target_indices: number[];
    results: Record<number, string>;
  } | null;
  round_count: number;
}

// ---- Phase 7: Config types ----

export interface ModelInfo {
  name: string;
  provider: string;
  model: string;
}

export interface AppConfigResponse {
  models: ModelInfo[];
  rewrite: {
    temperature: number;
    max_tokens: number;
    candidates_count: number;
  };
  validation: {
    enabled: boolean;
    strictness: string;
  };
}

export interface ConfigUpdatePayload {
  model?: string;
  temperature?: number;
  candidates_count?: number;
  max_tokens?: number;
}

// ---- Phase 9: Version backtracking ----

export interface ParagraphVersion {
  versionId: string;
  paragraphIndex: number;
  sessionId: string;
  content: string;
  roundNumber: number;
  createdAt: string;
  label: string;
}
