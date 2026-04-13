import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { parse as parseYAML } from 'yaml'
import type { PipelineConfig, ProviderConfig, RepoConfig, PipelineTask, TaskModelConfig } from '../types/index.js'

const RepoConfigSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  defaultBranch: z.string().default('main'),
  testCommand: z.string().optional(),
  cloneUrl: z.string().optional(),
})

const AIModelSchema = z.enum(['claude', 'codex', 'ollama', 'map'])

const PipelineTaskSchema = z.enum(['specGeneration', 'implementation', 'codeReview', 'conflictResolution'])

const TaskModelConfigSchema = z.object({
  provider: AIModelSchema,
  model: z.string().optional(),
})

const AgentAdapterSchema = z.enum(['claude', 'codex', 'ollama'])

const ProviderConfigSchema = z.object({
  timeoutMs: z.number().positive().optional(),
  structuredTimeoutMs: z.number().positive().optional(),
  agentTimeoutMs: z.number().positive().optional(),
  quota: z.number().int().nonnegative().optional(),
  model: z.string().optional(),
  agents: z.object({
    spec: z.object({ adapter: AgentAdapterSchema }).optional(),
    review: z.object({ adapter: AgentAdapterSchema }).optional(),
    execute: z.object({ adapter: AgentAdapterSchema }).optional(),
  }).optional(),
}).strict()

const RetryConfigSchema = z.object({
  maxAttempts: z.number().int().positive().default(3),
  backoffMinutes: z.number().positive().default(60),
})

const PipelineConfigSchema = z.object({
  repos: z.array(RepoConfigSchema),
  ollamaModel: z.string().default('qwen2.5-coder:latest'),
  maxIssuesPerRun: z.number().int().positive().default(10),
  quotaLimits: z
    .object({
      claude: z.number().int().positive().optional(),
      codex: z.number().int().positive().optional(),
    })
    .optional(),
  providerChain: z.array(AIModelSchema).optional(),
  taskModels: z.record(PipelineTaskSchema, TaskModelConfigSchema).optional(),
  providers: z.record(z.string(), ProviderConfigSchema).optional(),
  retry: RetryConfigSchema.optional(),
  mergeCommentTrigger: z.string().default('/merge'),
  mergeMethod: z.enum(['merge', 'squash', 'rebase']).default('merge'),
  mergeDraftPRs: z.boolean().default(false),
})

type ZodParsed = z.infer<typeof PipelineConfigSchema>

/** Map zod output to our strict PipelineConfig type, dropping undefined optionals. */
function toTyped(parsed: ZodParsed): PipelineConfig {
  const config: PipelineConfig = {
    repos: parsed.repos.map((r): RepoConfig => {
      const repo: RepoConfig = { owner: r.owner, name: r.name, defaultBranch: r.defaultBranch }
      if (r.testCommand !== undefined) repo.testCommand = r.testCommand
      if (r.cloneUrl !== undefined) repo.cloneUrl = r.cloneUrl
      return repo
    }),
    ollamaModel: parsed.ollamaModel,
    maxIssuesPerRun: parsed.maxIssuesPerRun,
  }

  if (parsed.quotaLimits !== undefined) {
    const limits: NonNullable<PipelineConfig['quotaLimits']> = {}
    if (parsed.quotaLimits.claude !== undefined) limits.claude = parsed.quotaLimits.claude
    if (parsed.quotaLimits.codex !== undefined) limits.codex = parsed.quotaLimits.codex
    config.quotaLimits = limits
  }

  if (parsed.providerChain !== undefined) {
    config.providerChain = parsed.providerChain
  }

  if (parsed.taskModels !== undefined) {
    const taskModels: Partial<Record<PipelineTask, TaskModelConfig>> = {}
    for (const [task, cfg] of Object.entries(parsed.taskModels)) {
      const entry: TaskModelConfig = { provider: cfg.provider }
      if (cfg.model !== undefined) entry.model = cfg.model
      taskModels[task as PipelineTask] = entry
    }
    config.taskModels = taskModels
  }

  if (parsed.providers !== undefined) {
    const providers: Partial<Record<string, ProviderConfig>> = {}
    for (const [name, pCfg] of Object.entries(parsed.providers)) {
      const entry: ProviderConfig = {}
      if (pCfg.timeoutMs !== undefined) entry.timeoutMs = pCfg.timeoutMs
      if (pCfg.structuredTimeoutMs !== undefined) entry.structuredTimeoutMs = pCfg.structuredTimeoutMs
      if (pCfg.agentTimeoutMs !== undefined) entry.agentTimeoutMs = pCfg.agentTimeoutMs
      if (pCfg.quota !== undefined) entry.quota = pCfg.quota
      if (pCfg.model !== undefined) entry.model = pCfg.model
      if (pCfg.agents !== undefined) entry.agents = pCfg.agents
      providers[name] = entry
    }
    config.providers = providers
  }

  if (parsed.retry !== undefined) {
    config.retry = parsed.retry
  }

  if (parsed.mergeCommentTrigger !== '/merge') {
    config.mergeCommentTrigger = parsed.mergeCommentTrigger
  }

  if (parsed.mergeMethod !== 'merge') {
    config.mergeMethod = parsed.mergeMethod
  }

  if (parsed.mergeDraftPRs) {
    config.mergeDraftPRs = parsed.mergeDraftPRs
  }

  return config
}

export function loadConfig(configPath: string): PipelineConfig {
  let raw: string
  try {
    raw = readFileSync(configPath, 'utf-8')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Config file not found at "${configPath}": ${message}`)
  }

  let parsed: unknown
  const isYAML = configPath.endsWith('.yaml') || configPath.endsWith('.yml')
  try {
    parsed = isYAML ? parseYAML(raw) : JSON.parse(raw)
  } catch (err) {
    const format = isYAML ? 'YAML' : 'JSON'
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid ${format} in config file "${configPath}": ${message}`)
  }

  const result = PipelineConfigSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid config schema in "${configPath}":\n${issues}`)
  }

  return toTyped(result.data)
}
