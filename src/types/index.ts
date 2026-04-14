/* v8 ignore file */
// Core domain types

export interface Issue {
  id: number;
  number: number;
  title: string;
  body: string;
  url: string;
  repoOwner: string;
  repoName: string;
}

export interface RepoConfig {
  owner: string;
  name: string;
  defaultBranch?: string;
  testCommand?: string;
  /** Override the git clone URL (useful for local/test environments). */
  cloneUrl?: string;
}

export interface ProviderConfig {
  timeoutMs?: number;
  quota?: number;
  model?: string;
  agents?: {
    spec?: { adapter: 'claude' | 'codex' | 'ollama' };
    review?: { adapter: 'claude' | 'codex' | 'ollama' };
    execute?: { adapter: 'claude' | 'codex' | 'ollama' };
  };
}

export type PipelineTask = 'specGeneration' | 'implementation' | 'codeReview' | 'conflictResolution'

export interface TaskModelConfig {
  provider: AIModel
  model?: string        // e.g., 'gemma3:latest' for Ollama
}

export interface RetryConfig {
  maxAttempts: number
  backoffMinutes: number
}

export interface PipelineConfig {
  repos: RepoConfig[];
  ollamaModel?: string;
  maxIssuesPerRun?: number;
  quotaLimits?: {
    claude?: number;
    codex?: number;
  };
  providerChain?: AIModel[];
  providers?: Partial<Record<string, ProviderConfig>>;
  taskModels?: Partial<Record<PipelineTask, TaskModelConfig>>;
  retry?: RetryConfig;
  mergeCommentTrigger?: string;
  mergeMethod?: 'merge' | 'squash' | 'rebase';
  mergeDraftPRs?: boolean;
  autoReviewLabel?: string;
  maxReviewRounds?: number;
}

export interface QuotaState {
  used: number;
  limit: number;
  resetMonth: string; // "YYYY-MM" format, UTC
}

export interface IssueOutcome {
  status: 'success' | 'failure'
  lastAttempt: string        // ISO 8601
  attemptCount: number
  error?: string             // truncated failure reason
  prUrl?: string
}

export interface PipelineState {
  processedIssues: Record<string, Record<number, IssueOutcome>>; // "owner/name" -> { issueNumber: outcome }
  quota: Record<string, QuotaState>; // keyed by AIModel values (extensible)
  starPromptSeen?: boolean;
}

export type AIModel = "claude" | "codex" | "ollama" | "map";

export interface AgentResult {
  success: boolean;
  filesWritten: string[];
  stdout: string;
  stderr: string;
}

export interface StructuredResult<T> {
  success: boolean;
  data?: T;
  rawOutput: string;
  error?: string;
}

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
}

export interface SpecOutput {
  spec: string;
  filesToCreate: string[];
  testStrategy: string;
}

export interface ProcessingResult {
  issueNumber: number;
  repoFullName: string;
  success: boolean;
  prUrl?: string;
  isDraft: boolean;
  testsPassed: boolean;
  modelUsed: AIModel;
  filesChanged: string[];
  error?: string;
}

export interface PRComment {
  id: number
  body: string
  user: string
  createdAt: string
}

export interface PRInfo {
  number: number
  url: string
  isDraft: boolean
  head: string      // branch name
  base: string      // target branch
}

export interface MergeResult {
  prNumber: number
  repoFullName: string
  merged: boolean
  conflictsResolved: number
  error?: string
}

export interface PRReviewResult {
  prNumber: number
  repoFullName: string
  merged: boolean
  reviewRounds: number
  error?: string
}

export interface ConflictFile {
  path: string
  content: string     // full file content with conflict markers
  baseContent: string // from git show :1:<path>
}

export interface RebaseResult {
  success: boolean
  conflicts: ConflictFile[]
}

// Provider interfaces
export interface AIProvider {
  model: AIModel;
  readonly handlesFullPipeline: boolean;
  invokeStructured<T>(prompt: string, schema: object, modelOverride?: string): Promise<StructuredResult<T>>;
  invokeAgent(prompt: string, workingDir: string): Promise<AgentResult>;
}
