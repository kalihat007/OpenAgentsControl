import type { Ability, AbilityExecution, ExecutorContext } from '../types/index.js'
import { executeAbility } from './index.js'

/**
 * Minimal ExecutionManager
 * 
 * Simplified to track SINGLE execution at a time.
 * No session management, no cleanup timers, no multi-execution.
 * 
 * This is the bare minimum to test the core concept.
 */
export class ExecutionManager {
  private activeExecution: AbilityExecution | null = null
  private executions: AbilityExecution[] = []
  private readonly maxHistory = 50

  async execute(
    ability: Ability,
    inputs: Record<string, unknown>,
    ctx: ExecutorContext
  ): Promise<AbilityExecution> {
    // Block concurrent executions
    if (this.activeExecution && this.activeExecution.status === 'running') {
      throw new Error(`Already executing ability: ${this.activeExecution.ability.name}`)
    }

    console.log(`[abilities] Starting execution: ${ability.name}`)
    
    const execution = await executeAbility(ability, inputs, ctx)
    this.activeExecution = execution
    this.executions.push(execution)
    if (this.executions.length > this.maxHistory) {
      this.executions.splice(0, this.executions.length - this.maxHistory)
    }

    // Clear active if completed/failed
    if (execution.status !== 'running') {
      this.activeExecution = null
    }

    return execution
  }

  getActive(): AbilityExecution | null {
    return this.activeExecution
  }

  get(id: string): AbilityExecution | undefined {
    return this.executions.find((execution) => execution.id === id)
  }

  list(): AbilityExecution[] {
    return [...this.executions]
  }

  cancel(id?: string): boolean {
    if (id) {
      const execution = this.get(id)
      if (!execution || execution.status !== 'running') return false
      execution.status = 'cancelled'
      execution.error = 'Cancelled by user'
      execution.completedAt = Date.now()
      if (this.activeExecution?.id === id) {
        this.activeExecution = null
      }
      return true
    }

    if (!this.activeExecution) return false
    
    if (this.activeExecution.status === 'running') {
      this.activeExecution.status = 'cancelled'
      this.activeExecution.error = 'Cancelled by user'
      this.activeExecution.completedAt = Date.now()
      this.activeExecution = null
      return true
    }

    return false
  }

  cancelActive(): boolean {
    return this.cancel()
  }

  onSessionDeleted(_sessionId: string): void {
    // Session-aware execution tracking is intentionally best-effort here.
    // OpenCode may notify deletion after the execution already completed.
  }

  cleanup(): void {
    this.activeExecution = null
    this.executions = []
  }
}
