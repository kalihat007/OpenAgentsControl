/**
 * Abilities System - Minimal Type Definitions
 * 
 * Stripped down to essentials for testing core concept:
 * - Script steps only
 * - Single execution tracking
 * - No session management
 */

// ─────────────────────────────────────────────────────────────
// INPUT TYPES
// ─────────────────────────────────────────────────────────────

export type InputType = 'string' | 'number' | 'boolean' | 'array' | 'object'

export interface InputDefinition {
  type: InputType
  required?: boolean
  default?: unknown
  description?: string
  pattern?: string
  enum?: string[]
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
}

export type InputValues = Record<string, unknown>

// ─────────────────────────────────────────────────────────────
// STEP TYPES
// ─────────────────────────────────────────────────────────────

export interface BaseStep {
  id: string
  description?: string
  needs?: string[]
  when?: string
  timeout?: string
  on_failure?: 'stop' | 'continue' | 'retry' | 'ask'
  max_retries?: number
  summarize?: boolean | string
}

export interface ScriptStep extends BaseStep {
  type: 'script'
  run: string
  cwd?: string
  env?: Record<string, string>
  validation?: {
    exit_code?: number
    stdout_contains?: string
    stderr_contains?: string
    file_exists?: string
  }
}

export interface AgentStep extends BaseStep {
  type: 'agent'
  agent: string
  prompt: string
  context?: string[]
}

export interface SkillStep extends BaseStep {
  type: 'skill'
  skill: string
  inputs?: Record<string, unknown>
}

export interface ApprovalStep extends BaseStep {
  type: 'approval'
  prompt: string
  options?: Array<{ label: string; value: string }> | string[]
}

export interface WorkflowStep extends BaseStep {
  type: 'workflow'
  workflow: string
  inputs?: Record<string, unknown>
}

export type Step = ScriptStep | AgentStep | SkillStep | ApprovalStep | WorkflowStep

// ─────────────────────────────────────────────────────────────
// ABILITY DEFINITION
// ─────────────────────────────────────────────────────────────

export interface Ability {
  name: string
  description: string
  inputs?: Record<string, InputDefinition>
  steps: Step[]
  settings?: {
    timeout?: string
    parallel?: boolean
    enforcement?: 'strict' | 'normal' | 'loose'
    approval?: 'plan' | 'checkpoint' | 'none'
    on_failure?: 'stop' | 'continue' | 'retry' | 'ask'
  }
  triggers?: {
    keywords?: string[]
    patterns?: string[]
  }
  hooks?: {
    before?: string[]
    after?: string[]
  }
  compatible_agents?: string[]
  exclusive_agent?: string
  _meta?: {
    filePath: string
    directory: string
    loadedAt?: number
  }
}

// ─────────────────────────────────────────────────────────────
// EXECUTION TYPES
// ─────────────────────────────────────────────────────────────

export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'cancelled'
export type StepStatus = 'completed' | 'failed' | 'skipped'

export interface StepResult {
  stepId: string
  status: StepStatus
  output?: string
  error?: string
  startedAt: number
  completedAt: number
  duration: number
}

export interface AbilityExecution {
  id: string
  ability: Ability
  inputs: InputValues
  status: ExecutionStatus
  currentStep: Step | null
  currentStepIndex: number
  completedSteps: StepResult[]
  pendingSteps: Step[]
  startedAt: number
  completedAt?: number
  error?: string
}

// ─────────────────────────────────────────────────────────────
// VALIDATION TYPES
// ─────────────────────────────────────────────────────────────

export interface ValidationError {
  path: string
  message: string
  code?: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  ability?: Ability
}

// ─────────────────────────────────────────────────────────────
// LOADER TYPES
// ─────────────────────────────────────────────────────────────

export interface LoaderOptions {
  projectDir?: string
  globalDir?: string
  includeGlobal?: boolean
}

export interface LoadedAbility {
  ability: Ability
  filePath: string
  source: 'project' | 'global'
}

// ─────────────────────────────────────────────────────────────
// EXECUTOR TYPES
// ─────────────────────────────────────────────────────────────

export interface ExecutorContext {
  cwd: string
  env: Record<string, string>
  agents?: {
    call(options: { agent: string; prompt: string; step?: AgentStep; inputs?: InputValues }): Promise<string>
    background?(options: { agent: string; prompt: string; step?: AgentStep; inputs?: InputValues }): Promise<string>
  }
  skills?: {
    load(name: string, inputs?: Record<string, unknown>): Promise<string>
  }
  approval?: {
    request(options: { prompt: string; options?: ApprovalStep['options']; step?: ApprovalStep }): Promise<boolean>
  }
  abilities?: {
    get(name: string): Ability | undefined
    execute(ability: Ability, inputs: InputValues): Promise<AbilityExecution>
  }
  onStepStart?: (step: Step) => void | Promise<void>
  onStepComplete?: (step: Step, result: StepResult) => void | Promise<void>
  onStepFail?: (step: Step, result: StepResult) => void | Promise<void>
}
