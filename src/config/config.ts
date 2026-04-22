import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { parse as parseYAML } from 'yaml'
import type { PipelineConfig, RepoConfig } from '../types/index.js'

const RepoConfigSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  defaultBranch: z.string().default('main'),
  testCommand: z.string().optional(),
  cloneUrl: z.string().optional(),
})

const RetryConfigSchema = z.object({
  maxAttempts: z.number().int().positive().default(3),
  backoffMinutes: z.number().positive().default(60),
})

const PipelineConfigSchema = z.object({
  repos: z.array(RepoConfigSchema),
  maxIssuesPerRun: z.number().int().positive().default(10),
  mapModel: z.string().optional(),
  mapTimeoutMs: z.number().int().positive().optional(),
  mapCommand: z.string().min(1).optional(),
  mapArgs: z.array(z.string()).optional(),
  retry: RetryConfigSchema.optional(),
  mergeCommentTrigger: z.string().default('/merge'),
  mergeMethod: z.enum(['merge', 'squash', 'rebase']).default('merge'),
  mergeDraftPRs: z.boolean().default(false),
  autoMerge: z.boolean().default(true),
  autoMergeRequireTests: z.boolean().default(true),
  maxPollRuns: z.number().int().positive().optional(),
  maxConsecutiveFailures: z.number().int().positive().default(5),
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
    maxIssuesPerRun: parsed.maxIssuesPerRun,
  }

  if (parsed.mapModel !== undefined) {
    config.mapModel = parsed.mapModel
  }

  if (parsed.mapTimeoutMs !== undefined) {
    config.mapTimeoutMs = parsed.mapTimeoutMs
  }

  if (parsed.mapCommand !== undefined) {
    config.mapCommand = parsed.mapCommand
  }

  if (parsed.mapArgs !== undefined) {
    config.mapArgs = parsed.mapArgs
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

  if (!parsed.autoMerge) {
    config.autoMerge = parsed.autoMerge
  }

  if (!parsed.autoMergeRequireTests) {
    config.autoMergeRequireTests = parsed.autoMergeRequireTests
  }

  if (parsed.maxPollRuns !== undefined) {
    config.maxPollRuns = parsed.maxPollRuns
  }

  config.maxConsecutiveFailures = parsed.maxConsecutiveFailures

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
