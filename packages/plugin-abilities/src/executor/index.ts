import { spawn } from 'child_process'
import type {
  Ability,
  Step,
  ScriptStep,
  AgentStep,
  SkillStep,
  ApprovalStep,
  WorkflowStep,
  AbilityExecution,
  StepResult,
  ExecutorContext,
  InputValues,
} from '../types/index.js'
import { validateInputs } from '../validator/index.js'

const MAX_CONTEXT_CHARS = 8_000

function generateExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function interpolateVariables(text: string, inputs: InputValues, execution?: AbilityExecution): string {
  let result = text.replace(/\{\{inputs\.(\w+)\}\}/g, (match, name) => {
    const value = inputs[name]
    return value !== undefined ? String(value) : match
  })

  if (execution) {
    result = result.replace(/\{\{steps\.([\w-]+)\.output\}\}/g, (match, stepId) => {
      const stepResult = execution.completedSteps.find((step) => step.stepId === stepId)
      return stepResult?.output !== undefined ? stepResult.output : match
    })
  }

  return result
}

function shouldRunStep(step: Step, inputs: InputValues): boolean {
  if (!step.when) return true

  const expression = step.when.trim()
  const match = expression.match(/^inputs\.(\w+)\s*(==|!=)\s*["'](.+)["']$/)
  if (!match) return true

  const [, name, operator, expected] = match
  const actual = inputs[name]
  return operator === '==' ? String(actual) === expected : String(actual) !== expected
}

function summarizeOutput(output: string): string {
  const lines = output.split(/\r?\n/)
  const preview = lines.slice(0, 8).join('\n')
  const omitted = Math.max(0, lines.length - 8)
  return `Output Summary:\n${preview}\n... ${omitted} lines omitted`
}

function trimOutput(output: string): string {
  if (output.length <= MAX_CONTEXT_CHARS) return output
  return `${output.slice(0, MAX_CONTEXT_CHARS)}\n... truncated ${output.length - MAX_CONTEXT_CHARS} characters`
}

function buildPriorStepContext(execution: AbilityExecution): string {
  if (execution.completedSteps.length === 0) return ''

  const stepById = new Map(execution.ability.steps.map((step) => [step.id, step]))
  const blocks = execution.completedSteps
    .filter((result) => result.output)
    .map((result) => {
      const step = stepById.get(result.stepId)
      const output = String(result.output || '')
      const renderedOutput = step?.summarize ? summarizeOutput(output) : trimOutput(output)
      return `Step ${result.stepId} (${result.status}):\n${renderedOutput}`
    })

  if (blocks.length === 0) return ''
  return `\n\nContext from prior steps:\n${blocks.join('\n\n')}`
}

function buildResult(
  stepId: string,
  status: StepResult['status'],
  startedAt: number,
  output?: string,
  error?: string
): StepResult {
  return {
    stepId,
    status,
    output,
    error,
    startedAt,
    completedAt: Date.now(),
    duration: Date.now() - startedAt,
  }
}

async function runScript(
  command: string,
  options: { cwd?: string; env?: Record<string, string> }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn('sh', ['-c', command], {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 })
    })

    proc.on('error', (error) => {
      resolve({ stdout, stderr: error.message, exitCode: 1 })
    })
  })
}

async function executeScriptStep(
  step: ScriptStep,
  execution: AbilityExecution,
  ctx: ExecutorContext
): Promise<StepResult> {
  const startedAt = Date.now()

  const command = interpolateVariables(step.run, execution.inputs, execution)

  console.log(`[abilities] Executing: ${command}`)

  try {
    const result = await runScript(command, {
      cwd: step.cwd || ctx.cwd,
      env: { ...ctx.env, ...step.env },
    })

    // Validate exit code if specified
    let failed = false
    let error: string | undefined

    if (step.validation?.exit_code !== undefined && result.exitCode !== step.validation.exit_code) {
      failed = true
      error = `Exit code ${result.exitCode}, expected ${step.validation.exit_code}`
    } else if (step.validation?.exit_code === undefined && result.exitCode !== 0) {
      failed = true
      error = `Exit code ${result.exitCode}`
    }

    if (!failed && step.validation?.stdout_contains && !result.stdout.includes(step.validation.stdout_contains)) {
      failed = true
      error = `stdout did not contain ${step.validation.stdout_contains}`
    }

    if (!failed && step.validation?.stderr_contains && !result.stderr.includes(step.validation.stderr_contains)) {
      failed = true
      error = `stderr did not contain ${step.validation.stderr_contains}`
    }

    return buildResult(step.id, failed ? 'failed' : 'completed', startedAt, result.stdout || result.stderr, error)
  } catch (err) {
    return buildResult(step.id, 'failed', startedAt, undefined, err instanceof Error ? err.message : String(err))
  }
}

async function executeAgentStep(
  step: AgentStep,
  execution: AbilityExecution,
  ctx: ExecutorContext
): Promise<StepResult> {
  const startedAt = Date.now()
  if (!ctx.agents?.call) {
    return buildResult(step.id, 'failed', startedAt, undefined, 'Agent execution not available')
  }

  const prompt = interpolateVariables(step.prompt, execution.inputs, execution) + buildPriorStepContext(execution)
  const output = await ctx.agents.call({ agent: step.agent, prompt, step, inputs: execution.inputs })
  return buildResult(step.id, 'completed', startedAt, output)
}

async function executeSkillStep(
  step: SkillStep,
  execution: AbilityExecution,
  ctx: ExecutorContext
): Promise<StepResult> {
  const startedAt = Date.now()
  if (!ctx.skills?.load) {
    return buildResult(step.id, 'failed', startedAt, undefined, 'Skill execution not available')
  }

  const inputs = interpolateObject(step.inputs || {}, execution)
  const output = await ctx.skills.load(step.skill, inputs)
  return buildResult(step.id, 'completed', startedAt, output)
}

async function executeApprovalStep(
  step: ApprovalStep,
  execution: AbilityExecution,
  ctx: ExecutorContext
): Promise<StepResult> {
  const startedAt = Date.now()
  if (!ctx.approval?.request) {
    return buildResult(step.id, 'failed', startedAt, undefined, 'Approval not available')
  }

  const prompt = interpolateVariables(step.prompt, execution.inputs, execution)
  const approved = await ctx.approval.request({ prompt, options: step.options, step })
  return buildResult(step.id, approved ? 'completed' : 'failed', startedAt, approved ? 'Approved' : 'Rejected', approved ? undefined : 'Approval rejected')
}

async function executeWorkflowStep(
  step: WorkflowStep,
  execution: AbilityExecution,
  ctx: ExecutorContext
): Promise<StepResult> {
  const startedAt = Date.now()
  if (!ctx.abilities) {
    return buildResult(step.id, 'failed', startedAt, undefined, 'Nested workflow execution not available')
  }

  const ability = ctx.abilities.get(step.workflow)
  if (!ability) {
    return buildResult(step.id, 'failed', startedAt, undefined, `Nested workflow '${step.workflow}' not found`)
  }

  const inputs = interpolateObject(step.inputs || {}, execution)
  const nested = await ctx.abilities.execute(ability, inputs)
  if (nested.status === 'completed') {
    return buildResult(step.id, 'completed', startedAt, `Nested workflow '${step.workflow}' completed successfully`)
  }

  return buildResult(step.id, 'failed', startedAt, undefined, nested.error || `Nested workflow '${step.workflow}' failed`)
}

function interpolateObject(values: Record<string, unknown>, execution: AbilityExecution): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === 'string' ? interpolateVariables(value, execution.inputs, execution) : value,
    ])
  )
}

async function executeStep(
  step: Step,
  execution: AbilityExecution,
  ctx: ExecutorContext
): Promise<StepResult> {
  switch (step.type) {
    case 'script':
      return executeScriptStep(step, execution, ctx)
    case 'agent':
      return executeAgentStep(step, execution, ctx)
    case 'skill':
      return executeSkillStep(step, execution, ctx)
    case 'approval':
      return executeApprovalStep(step, execution, ctx)
    case 'workflow':
      return executeWorkflowStep(step, execution, ctx)
  }
}

function buildExecutionOrder(steps: Step[]): Step[] {
  const result: Step[] = []
  const completed = new Set<string>()
  const remaining = [...steps]

  while (remaining.length > 0) {
    const next = remaining.find((step) => {
      if (!step.needs || step.needs.length === 0) return true
      return step.needs.every((dep) => completed.has(dep))
    })

    if (!next) {
      console.error('[abilities] Unable to resolve step order - circular dependency?')
      break
    }

    result.push(next)
    completed.add(next.id)
    remaining.splice(remaining.indexOf(next), 1)
  }

  return result
}

export async function executeAbility(
  ability: Ability,
  inputs: InputValues,
  ctx: ExecutorContext
): Promise<AbilityExecution> {
  // Apply defaults
  const resolvedInputs: InputValues = { ...inputs }
  if (ability.inputs) {
    for (const [name, def] of Object.entries(ability.inputs)) {
      if (resolvedInputs[name] === undefined && def.default !== undefined) {
        resolvedInputs[name] = def.default
      }
    }
  }

  // Validate inputs after defaults are applied
  const inputErrors = validateInputs(ability, resolvedInputs)
  if (inputErrors.length > 0) {
    return {
      id: generateExecutionId(),
      ability,
      inputs: resolvedInputs,
      status: 'failed',
      currentStep: null,
      currentStepIndex: -1,
      completedSteps: [],
      pendingSteps: ability.steps,
      startedAt: Date.now(),
      completedAt: Date.now(),
      error: `Input validation failed: ${inputErrors.map((e) => e.message).join(', ')}`,
    }
  }

  // Build execution order based on dependencies
  const orderedSteps = buildExecutionOrder(ability.steps)

  const execution: AbilityExecution = {
    id: generateExecutionId(),
    ability,
    inputs: resolvedInputs,
    status: 'running',
    currentStep: null,
    currentStepIndex: -1,
    completedSteps: [],
    pendingSteps: [...orderedSteps],
    startedAt: Date.now(),
  }

  // Execute steps sequentially
  for (let i = 0; i < orderedSteps.length; i++) {
    const step = orderedSteps[i]
    execution.currentStep = step
    execution.currentStepIndex = i

    console.log(`[abilities] Step ${i + 1}/${orderedSteps.length}: ${step.id}`)

    await ctx.onStepStart?.(step)

    if (!shouldRunStep(step, execution.inputs)) {
      const skipped = buildResult(step.id, 'skipped', Date.now(), 'Skipped: condition not met')
      execution.completedSteps.push(skipped)
      execution.pendingSteps = execution.pendingSteps.filter((s) => s.id !== step.id)
      await ctx.onStepComplete?.(step, skipped)
      continue
    }

    const result = await executeStep(step, execution, ctx)
    execution.completedSteps.push(result)
    execution.pendingSteps = execution.pendingSteps.filter((s) => s.id !== step.id)

    if (result.status === 'failed') {
      await ctx.onStepFail?.(step, result)
      const failureMode = step.on_failure || ability.settings?.on_failure || 'stop'
      if (failureMode !== 'continue') {
        execution.status = 'failed'
        execution.error = result.error
        execution.completedAt = Date.now()
        return execution
      }
    } else {
      await ctx.onStepComplete?.(step, result)
    }
  }

  execution.status = 'completed'
  execution.currentStep = null
  execution.completedAt = Date.now()

  return execution
}

export function formatExecutionResult(execution: AbilityExecution): string {
  const lines: string[] = []

  lines.push(`Ability: ${execution.ability.name}`)
  lines.push(`Status: ${execution.status === 'completed' ? '✅ Complete' : '❌ Failed'}`)

  if (execution.error) {
    lines.push(`Error: ${execution.error}`)
  }

  lines.push('')
  lines.push('Steps:')

  for (const result of execution.completedSteps) {
    const icon = result.status === 'completed' ? '✅' : '❌'
    const duration = result.duration ? ` (${(result.duration / 1000).toFixed(1)}s)` : ''
    lines.push(`  ${icon} ${result.stepId}${duration}`)
    if (result.error) {
      lines.push(`     Error: ${result.error}`)
    }
  }

  const totalDuration = execution.completedAt
    ? ((execution.completedAt - execution.startedAt) / 1000).toFixed(1)
    : 'N/A'
  lines.push('')
  lines.push(`Duration: ${totalDuration}s`)

  return lines.join('\n')
}
