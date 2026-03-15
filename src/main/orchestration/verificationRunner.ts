import { execFile } from 'child_process'
import path from 'path'
import type {
  VerificationCommandResult,
  VerificationIssue,
  VerificationProfile,
  VerificationProfileName,
  VerificationRunStatus,
  VerificationStep,
  VerificationSummary,
} from './types'

const COMMAND_TIMEOUT_MS = 120_000
const MAX_BUFFER_BYTES = 4 * 1024 * 1024

export interface VerificationPolicy {
  allowExpensive?: boolean
  approvedStepIds?: string[]
}

export interface VerificationRequest {
  profile: VerificationProfileName
  workspaceRoots: string[]
  touchedFiles?: string[]
  policy?: VerificationPolicy
}

export interface DiagnosticsProvider {
  getIssues: (workspaceRoot: string, touchedFiles?: string[]) => Promise<VerificationIssue[]>
}

export interface VerificationRunnerDeps {
  diagnosticsProvider?: DiagnosticsProvider
  runCommand?: (workspaceRoot: string, step: VerificationStep) => Promise<VerificationCommandResult>
  now?: () => number
}

interface CommandExecution {
  exitCode: number
  stdout: string
  stderr: string
}

function npmExecutable(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function getWorkspaceRoot(workspaceRoots: string[]): string {
  return workspaceRoots[0] ?? process.cwd()
}

function createFastProfile(): VerificationProfile {
  return {
    name: 'fast',
    label: 'Fast',
    description: 'Quick diagnostics and git state checks.',
    steps: [
      { id: 'diagnostics', label: 'Diagnostics snapshot', kind: 'diagnostics', requiresApproval: false, readOnly: true },
      { id: 'git-status', label: 'Git status', kind: 'git', command: 'git status --short', requiresApproval: false, readOnly: true },
    ],
    allowsExpensiveSteps: false,
    mayRequireApproval: false,
  }
}

function createDefaultProfile(): VerificationProfile {
  return {
    name: 'default',
    label: 'Default',
    description: 'Daily confidence pass with build validation.',
    steps: [
      { id: 'diagnostics', label: 'Diagnostics snapshot', kind: 'diagnostics', requiresApproval: false, readOnly: true },
      { id: 'git-status', label: 'Git status', kind: 'git', command: 'git status --short', requiresApproval: false, readOnly: true },
      { id: 'build', label: 'Build', kind: 'command', command: 'npm run build', requiresApproval: false, readOnly: true },
    ],
    allowsExpensiveSteps: false,
    mayRequireApproval: false,
  }
}

function createFullProfile(): VerificationProfile {
  return {
    name: 'full',
    label: 'Full',
    description: 'Highest-confidence pass including test and lint checks.',
    steps: [
      { id: 'diagnostics', label: 'Diagnostics snapshot', kind: 'diagnostics', requiresApproval: false, readOnly: true },
      { id: 'git-status', label: 'Git status', kind: 'git', command: 'git status --short', requiresApproval: false, readOnly: true },
      { id: 'build', label: 'Build', kind: 'command', command: 'npm run build', requiresApproval: false, readOnly: true },
      { id: 'test', label: 'Tests', kind: 'command', command: 'npm test', requiresApproval: true, readOnly: true },
      { id: 'lint', label: 'Lint', kind: 'command', command: 'npm run lint', requiresApproval: true, readOnly: true },
    ],
    allowsExpensiveSteps: true,
    mayRequireApproval: true,
  }
}

function createProfiles(): Record<VerificationProfileName, VerificationProfile> {
  return {
    fast: createFastProfile(),
    default: createDefaultProfile(),
    full: createFullProfile(),
  }
}

function approvedStepIds(policy?: VerificationPolicy): Set<string> {
  return new Set(policy?.approvedStepIds ?? [])
}

function canRunStep(step: VerificationStep, policy: VerificationPolicy | undefined): boolean {
  if (!step.requiresApproval) {
    return true
  }
  if (policy?.allowExpensive) {
    return true
  }
  return approvedStepIds(policy).has(step.id)
}

function skipStep(step: VerificationStep): VerificationCommandResult {
  return {
    stepId: step.id,
    status: 'skipped',
    stdout: '',
    stderr: 'Skipped: step requires explicit verification approval.',
    exitCode: undefined,
    durationMs: 0,
  }
}

function toCommand(step: VerificationStep): { command: string; args: string[] } {
  if (!step.command) {
    throw new Error(`Verification step ${step.id} is missing a command`)
  }
  if (step.command === 'git status --short') {
    return { command: 'git', args: ['status', '--short'] }
  }
  if (step.command === 'npm run build') {
    return { command: npmExecutable(), args: ['run', 'build'] }
  }
  if (step.command === 'npm test') {
    return { command: npmExecutable(), args: ['test'] }
  }
  if (step.command === 'npm run lint') {
    return { command: npmExecutable(), args: ['run', 'lint'] }
  }
  throw new Error(`Unsupported verification command: ${step.command}`)
}

function executeCommand(workspaceRoot: string, step: VerificationStep): Promise<CommandExecution> {
  const invocation = toCommand(step)
  return new Promise((resolve) => {
    execFile(
      invocation.command,
      invocation.args,
      { cwd: workspaceRoot, timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES },
      (error, stdout, stderr) => {
        const errorCode = typeof (error as NodeJS.ErrnoException | null)?.code === 'number'
          ? Number((error as NodeJS.ErrnoException).code)
          : 1
        resolve({
          exitCode: error ? errorCode : 0,
          stdout,
          stderr: error instanceof Error && !stderr ? error.message : stderr,
        })
      },
    )
  })
}

async function runCommandStep(
  workspaceRoot: string,
  step: VerificationStep,
  runCommand: VerificationRunnerDeps['runCommand'],
  now: () => number,
): Promise<VerificationCommandResult> {
  const startedAt = now()
  const result = runCommand
    ? await runCommand(workspaceRoot, step)
    : await executeCommand(workspaceRoot, step).then((output) => ({
      stepId: step.id,
      status: output.exitCode === 0 ? 'passed' as const : 'failed' as const,
      exitCode: output.exitCode,
      stdout: output.stdout,
      stderr: output.stderr,
      durationMs: now() - startedAt,
    }))
  return {
    ...result,
    stepId: result.stepId || step.id,
    durationMs: result.durationMs ?? now() - startedAt,
  }
}

function diagnosticsCommandResult(step: VerificationStep, issues: VerificationIssue[]): VerificationCommandResult {
  return {
    stepId: step.id,
    status: issues.some((issue) => issue.severity === 'error') ? 'failed' : 'passed',
    stdout: issues.length > 0 ? JSON.stringify(issues, null, 2) : 'No diagnostics issues found.',
    stderr: '',
    exitCode: issues.some((issue) => issue.severity === 'error') ? 1 : 0,
    durationMs: 0,
  }
}

async function runDiagnosticsStep(
  workspaceRoot: string,
  step: VerificationStep,
  touchedFiles: string[] | undefined,
  diagnosticsProvider: DiagnosticsProvider | undefined,
): Promise<{ commandResult: VerificationCommandResult; issues: VerificationIssue[] }> {
  if (!diagnosticsProvider) {
    return {
      commandResult: {
        stepId: step.id,
        status: 'skipped',
        stdout: '',
        stderr: 'Skipped: no diagnostics provider was configured.',
        durationMs: 0,
      },
      issues: [],
    }
  }
  const issues = await diagnosticsProvider.getIssues(workspaceRoot, touchedFiles)
  return { commandResult: diagnosticsCommandResult(step, issues), issues }
}

function combineStatus(results: VerificationCommandResult[]): VerificationRunStatus {
  if (results.some((result) => result.status === 'failed')) {
    return 'failed'
  }
  if (results.every((result) => result.status === 'skipped')) {
    return 'skipped'
  }
  if (results.some((result) => result.status === 'running')) {
    return 'running'
  }
  return 'passed'
}

function buildSummaryLine(profile: VerificationProfile, status: VerificationRunStatus, issues: VerificationIssue[]): string {
  const issueCount = issues.length
  if (status === 'failed') {
    return `${profile.label} verification failed with ${issueCount} issue${issueCount === 1 ? '' : 's'}.`
  }
  if (status === 'skipped') {
    return `${profile.label} verification skipped because required approval was not granted.`
  }
  return `${profile.label} verification ${status} with ${issueCount} issue${issueCount === 1 ? '' : 's'}.`
}

export class VerificationRunner {
  private readonly profiles = createProfiles()

  constructor(private readonly deps: VerificationRunnerDeps = {}) { }

  getProfile(name: VerificationProfileName): VerificationProfile {
    return this.profiles[name]
  }

  listProfiles(): VerificationProfile[] {
    return Object.values(this.profiles)
  }

  async run(request: VerificationRequest): Promise<VerificationSummary> {
    const profile = this.getProfile(request.profile)
    const now = this.deps.now ?? Date.now
    const workspaceRoot = getWorkspaceRoot(request.workspaceRoots)
    const startedAt = now()
    const commandResults: VerificationCommandResult[] = []
    const issues: VerificationIssue[] = []
    let requiredApproval = false

    for (const step of profile.steps) {
      if (!canRunStep(step, request.policy)) {
        requiredApproval = true
        commandResults.push(skipStep(step))
        continue
      }
      if (step.kind === 'diagnostics') {
        const diagnostics = await runDiagnosticsStep(workspaceRoot, step, request.touchedFiles, this.deps.diagnosticsProvider)
        commandResults.push(diagnostics.commandResult)
        issues.push(...diagnostics.issues)
        continue
      }
      const result = await runCommandStep(workspaceRoot, step, this.deps.runCommand, now)
      commandResults.push(result)
      if (result.status === 'failed') {
        issues.push({ severity: 'error', message: `${step.label} failed`, filePath: path.join(workspaceRoot, '.') })
      }
    }

    const status = combineStatus(commandResults)
    return {
      profile: request.profile,
      status,
      startedAt,
      completedAt: now(),
      commandResults,
      issues,
      summary: buildSummaryLine(profile, status, issues),
      requiredApproval,
    }
  }
}

export function createVerificationRunner(deps: VerificationRunnerDeps = {}): VerificationRunner {
  return new VerificationRunner(deps)
}
