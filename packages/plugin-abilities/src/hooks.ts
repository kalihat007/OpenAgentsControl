/**
 * Lifecycle Hooks System
 *
 * Provides hook points for plugin lifecycle events:
 * - beforeTaskExecution / afterTaskExecution / onTaskError
 * - onPluginLoad / onPluginUnload
 *
 * Hooks are async-capable and run in registration order (with priority support).
 */

export type HookEvent =
  | 'beforeTaskExecution'
  | 'afterTaskExecution'
  | 'onTaskError'
  | 'onPluginLoad'
  | 'onPluginUnload'

export interface TaskExecutionContext {
  taskId: string
  pluginId: string
  inputs: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface TaskExecutionResult {
  taskId: string
  pluginId: string
  status: 'completed' | 'failed'
  output?: unknown
  duration: number
}

export interface TaskErrorContext {
  taskId: string
  pluginId: string
  error: Error
  inputs: Record<string, unknown>
}

export interface PluginLoadContext {
  pluginId: string
  version?: string
  capabilities?: string[]
}

export interface PluginUnloadContext {
  pluginId: string
  reason?: string
}

export type HookPayloadMap = {
  beforeTaskExecution: TaskExecutionContext
  afterTaskExecution: TaskExecutionResult
  onTaskError: TaskErrorContext
  onPluginLoad: PluginLoadContext
  onPluginUnload: PluginUnloadContext
}

export type HookHandler<E extends HookEvent = HookEvent> = (
  payload: HookPayloadMap[E]
) => void | Promise<void>

export interface HookRegistration<E extends HookEvent = HookEvent> {
  event: E
  handler: HookHandler<E>
  priority: number
}

const DEFAULT_PRIORITY = 10

export class HookManager {
  private hooks: Map<HookEvent, HookRegistration[]> = new Map()

  registerHook<E extends HookEvent>(
    event: E,
    handler: HookHandler<E>,
    priority: number = DEFAULT_PRIORITY
  ): void {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, [])
    }

    const registrations = this.hooks.get(event)!
    registrations.push({ event, handler: handler as HookHandler, priority })
    registrations.sort((a, b) => a.priority - b.priority)
  }

  removeHook<E extends HookEvent>(event: E, handler: HookHandler<E>): boolean {
    const registrations = this.hooks.get(event)
    if (!registrations) return false

    const index = registrations.findIndex((r) => r.handler === handler)
    if (index === -1) return false

    registrations.splice(index, 1)
    return true
  }

  async emit<E extends HookEvent>(
    event: E,
    payload: HookPayloadMap[E]
  ): Promise<void> {
    const registrations = this.hooks.get(event)
    if (!registrations || registrations.length === 0) return

    for (const registration of registrations) {
      await registration.handler(payload as any)
    }
  }

  getHooks(event: HookEvent): HookRegistration[] {
    return [...(this.hooks.get(event) || [])]
  }

  hasHooks(event: HookEvent): boolean {
    const registrations = this.hooks.get(event)
    return !!registrations && registrations.length > 0
  }

  clear(event?: HookEvent): void {
    if (event) {
      this.hooks.delete(event)
    } else {
      this.hooks.clear()
    }
  }
}

let globalHookManager: HookManager | null = null

export function getHookManager(): HookManager {
  if (!globalHookManager) {
    globalHookManager = new HookManager()
  }
  return globalHookManager
}

export function registerHook<E extends HookEvent>(
  event: E,
  handler: HookHandler<E>,
  priority?: number
): void {
  getHookManager().registerHook(event, handler, priority)
}

export function removeHook<E extends HookEvent>(
  event: E,
  handler: HookHandler<E>
): boolean {
  return getHookManager().removeHook(event, handler)
}

export function resetHookManager(): void {
  globalHookManager = null
}
