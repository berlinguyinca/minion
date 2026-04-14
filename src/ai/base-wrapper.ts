import { spawn } from 'node:child_process'
import { AITimeoutError, AIBinaryNotFoundError, AIInvocationError, detectRateLimitError } from './errors.js'

export interface InvokeProcessOptions {
  command: string
  args: string[]
  cwd?: string
  timeoutMs: number
  model: string
}

export interface InvokeProcessResult {
  stdout: string
  stderr: string
}

export async function invokeProcess(options: InvokeProcessOptions): Promise<InvokeProcessResult> {
  const { command, args, cwd, timeoutMs, model } = options

  return new Promise<InvokeProcessResult>((resolve, reject) => {
    let settled = false

    function settle(fn: () => void): void {
      if (!settled) {
        settled = true
        fn()
      }
    }

    let proc: ReturnType<typeof spawn>
    try {
      proc = spawn(command, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException
      if (nodeErr.code === 'ENOENT') {
        reject(new AIBinaryNotFoundError(command))
      } else {
        reject(err)
      }
      return
    }

    const timer = setTimeout(() => {
      try {
        proc.kill()
      } catch {
        // best effort
      }
      settle(() => reject(new AITimeoutError(model, timeoutMs)))
    }, timeoutMs)

    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []

    proc.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk))
    proc.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

    proc.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      if (err.code === 'ENOENT') {
        settle(() => reject(new AIBinaryNotFoundError(command)))
      } else {
        settle(() => reject(err))
      }
    })

    proc.on('close', (code: number | null) => {
      clearTimeout(timer)

      const stdout = Buffer.concat(stdoutChunks).toString('utf-8')
      const stderr = Buffer.concat(stderrChunks).toString('utf-8')

      if (code !== 0) {
        const raw = stderr || stdout
        const rateLimitErr = detectRateLimitError(model, code ?? -1, raw)
        settle(() => reject(rateLimitErr ?? new AIInvocationError(model, code ?? -1, raw)))
        return
      }

      settle(() => resolve({ stdout, stderr }))
    })
  })
}
