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
  model?: string;
  agents?: {
    spec?: { adapter: 'claude' | 'codex' | 'ollama' };
    review?: { adapter: 'claude' | 'codex' | 'ollama' };
    execute?: { adapter: 'claude' | 'codex' | 'ollama' };
  };
}

export interface RetryConfig {
  maxAttempts: number
  backoffMinutes: number
}

export interface PipelineConfig {
  repos: RepoConfig[];
  maxIssuesPerRun?: number;
  mapModel?: string;
  mapTimeoutMs?: number;
  retry?: RetryConfig;
  mergeCommentTrigger?: string;
  mergeMethod?: 'merge' | 'squash' | 'rebase';
  mergeDraftPRs?: boolean;
  autoMerge?: boolean;
  autoMergeRequireTests?: boolean;
  maxPollRuns?: number;
  maxConsecutiveFailures?: number;
}

export interface IssueOutcome {
  status: 'success' | 'failure' | 'partial'
  lastAttempt: string        // ISO 8601
  attemptCount: number
  error?: string             // truncated failure reason
  prUrl?: string
}

export interface PROutcome {
  status: 'merged' | 'split' | 'failed'
  lastAttempt: string        // ISO 8601
  attemptCount: number
  error?: string
}

export interface PipelineState {
  processedIssues: Record<string, Record<number, IssueOutcome>>; // "owner/name" -> { issueNumber: outcome }
  reviewedPRs?: Record<string, Record<number, PROutcome>>;      // "owner/name" -> { prNumber: outcome }
  starPromptSeen?: boolean;
}

export type AIModel = "map";

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
  title: string
  labels: string[]
}

export type ReviewVerdict = 'merge' | 'split'

export interface PRReviewResult {
  prNumber: number
  repoFullName: string
  verdict: ReviewVerdict
  merged: boolean
  splitInto: number[]   // PR numbers of child PRs (empty if merged or failed)
  error?: string
}

export interface SplitGroup {
  name: string           // e.g., "tests", "core-logic", "config"
  description: string    // human-readable summary
  files: string[]        // file paths in this group
}

export interface SplitPlan {
  groups: SplitGroup[]
  reasoning: string
}

export interface MergeResult {
  prNumber: number
  repoFullName: string
  merged: boolean
  conflictsResolved: number
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
