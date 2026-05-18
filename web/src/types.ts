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

export type RewritePhase =
  | 'idle'
  | 'loading_article'
  | 'ready'
  | 'rewriting'
  | 'generating_candidates'
  | 'waiting_selection'
  | 'done';
