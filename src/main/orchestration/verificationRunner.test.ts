import { describe, expect, it, vi } from 'vitest'

import { createVerificationRunner } from './verificationRunner'
import type { VerificationStep } from './types'

function createRunCommand(durationMs: number) {
  return vi.fn(async (_workspaceRoot: string, step: VerificationStep) => ({
    stepId: step.id,
    status: 'passed' as const,
    exitCode: 0,
    stdout: `${step.id} ok`,
    stderr: '',
    durationMs,
  }))
}

function createNow(seed: number): () => number {
  let tick = seed
  return () => ++tick
}

function registerApprovalGateTest(): void {
  it('skips approval-gated full-profile steps unless they are explicitly allowed', async () => {
    const runCommand = createRunCommand(5)
    const runner = createVerificationRunner({ diagnosticsProvider: { getIssues: async () => [] }, runCommand, now: createNow(10) })
    const summary = await runner.run({ profile: 'full', workspaceRoots: ['C:/workspace'], policy: {} })

    expect(summary.status).toBe('passed')
    expect(summary.requiredApproval).toBe(true)
    expect(summary.commandResults.map((result) => [result.stepId, result.status])).toEqual([
      ['diagnostics', 'passed'],
      ['git-status', 'passed'],
      ['build', 'passed'],
      ['test', 'skipped'],
      ['lint', 'skipped'],
    ])
    expect(runCommand).toHaveBeenCalledTimes(2)
    expect(runCommand.mock.calls.map(([, step]) => step.id)).toEqual(['git-status', 'build'])
  })
}

function registerAllowedExpensiveTest(): void {
  it('runs approval-gated steps when allowed and reports diagnostic failures', async () => {
    const runCommand = createRunCommand(7)
    const runner = createVerificationRunner({
      diagnosticsProvider: { getIssues: async () => [{ severity: 'error', message: 'Type error', filePath: 'C:/workspace/src/index.ts' }] },
      runCommand,
      now: createNow(20),
    })
    const summary = await runner.run({
      profile: 'full',
      workspaceRoots: ['C:/workspace'],
      touchedFiles: ['C:/workspace/src/index.ts'],
      policy: { allowExpensive: true },
    })

    expect(summary.status).toBe('failed')
    expect(summary.requiredApproval).toBe(false)
    expect(summary.commandResults.every((result) => result.status === 'passed' || result.stepId === 'diagnostics')).toBe(true)
    expect(summary.commandResults.find((result) => result.stepId === 'diagnostics')).toMatchObject({ status: 'failed', exitCode: 1 })
    expect(runCommand.mock.calls.map(([, step]) => step.id)).toEqual(['git-status', 'build', 'test', 'lint'])
    expect(summary.issues).toContainEqual({ severity: 'error', message: 'Type error', filePath: 'C:/workspace/src/index.ts' })
  })
}

describe('verificationRunner', () => {
  registerApprovalGateTest()
  registerAllowedExpensiveTest()
})
