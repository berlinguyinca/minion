import { z } from 'zod'
import { readFileSync } from 'node:fs'
import type { PipelineConfig, RepoConfig } from '../types/index.js'

const RepoConfigSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  defaultBranch: z.string().default('main'),
  testCommand: z.string().optional(),
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
})

type ZodParsed = z.infer<typeof PipelineConfigSchema>

/** Map zod output to our strict PipelineConfig type, dropping undefined optionals. */
function toTyped(parsed: ZodParsed): PipelineConfig {
  const config: PipelineConfig = {
    repos: parsed.repos.map((r): RepoConfig => {
      const repo: RepoConfig = { owner: r.owner, name: r.name, defaultBranch: r.defaultBranch }
      if (r.testCommand !== undefined) repo.testCommand = r.testCommand
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
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JSON in config file "${configPath}": ${message}`)
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
