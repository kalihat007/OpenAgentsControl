import { describe, expect, it, beforeEach } from 'bun:test'
import {
  HookManager,
  getHookManager,
  registerHook,
  removeHook,
  resetHookManager,
  type HookHandler,
  type TaskExecutionContext,
  type TaskExecutionResult,
  type TaskErrorContext,
  type PluginLoadContext,
  type PluginUnloadContext,
} from '../src/hooks.js'

describe('HookManager', () => {
  let manager: HookManager

  beforeEach(() => {
    manager = new HookManager()
  })

  describe('registerHook', () => {
    it('should register a hook for an event', () => {
      const handler: HookHandler<'beforeTaskExecution'> = async () => {}
      manager.registerHook('beforeTaskExecution', handler)

      expect(manager.hasHooks('beforeTaskExecution')).toBe(true)
      expect(manager.getHooks('beforeTaskExecution')).toHaveLength(1)
    })

    it('should register multiple hooks for the same event', () => {
      const handler1: HookHandler<'beforeTaskExecution'> = async () => {}
      const handler2: HookHandler<'beforeTaskExecution'> = async () => {}

      manager.registerHook('beforeTaskExecution', handler1)
      manager.registerHook('beforeTaskExecution', handler2)

      expect(manager.getHooks('beforeTaskExecution')).toHaveLength(2)
    })

    it('should register hooks for different events', () => {
      const handler1: HookHandler<'beforeTaskExecution'> = async () => {}
      const handler2: HookHandler<'afterTaskExecution'> = async () => {}

      manager.registerHook('beforeTaskExecution', handler1)
      manager.registerHook('afterTaskExecution', handler2)

      expect(manager.getHooks('beforeTaskExecution')).toHaveLength(1)
      expect(manager.getHooks('afterTaskExecution')).toHaveLength(1)
    })

    it('should use default priority of 10', () => {
      const handler: HookHandler<'onPluginLoad'> = async () => {}
      manager.registerHook('onPluginLoad', handler)

      const hooks = manager.getHooks('onPluginLoad')
      expect(hooks[0].priority).toBe(10)
    })

    it('should accept custom priority', () => {
      const handler: HookHandler<'onPluginLoad'> = async () => {}
      manager.registerHook('onPluginLoad', handler, 5)

      const hooks = manager.getHooks('onPluginLoad')
      expect(hooks[0].priority).toBe(5)
    })
  })

  describe('removeHook', () => {
    it('should remove a registered hook', () => {
      const handler: HookHandler<'beforeTaskExecution'> = async () => {}
      manager.registerHook('beforeTaskExecution', handler)

      const removed = manager.removeHook('beforeTaskExecution', handler)

      expect(removed).toBe(true)
      expect(manager.getHooks('beforeTaskExecution')).toHaveLength(0)
    })

    it('should return false when removing non-existent hook', () => {
      const handler: HookHandler<'beforeTaskExecution'> = async () => {}
      const removed = manager.removeHook('beforeTaskExecution', handler)

      expect(removed).toBe(false)
    })

    it('should return false for event with no registrations', () => {
      const handler: HookHandler<'onPluginUnload'> = async () => {}
      const removed = manager.removeHook('onPluginUnload', handler)

      expect(removed).toBe(false)
    })

    it('should only remove the specific handler', () => {
      const handler1: HookHandler<'beforeTaskExecution'> = async () => {}
      const handler2: HookHandler<'beforeTaskExecution'> = async () => {}

      manager.registerHook('beforeTaskExecution', handler1)
      manager.registerHook('beforeTaskExecution', handler2)
      manager.removeHook('beforeTaskExecution', handler1)

      expect(manager.getHooks('beforeTaskExecution')).toHaveLength(1)
      expect(manager.getHooks('beforeTaskExecution')[0].handler).toBe(handler2)
    })
  })

  describe('emit', () => {
    it('should call registered handlers with payload', async () => {
      let received: TaskExecutionContext | null = null
      const handler: HookHandler<'beforeTaskExecution'> = async (payload) => {
        received = payload
      }

      manager.registerHook('beforeTaskExecution', handler)

      const payload: TaskExecutionContext = {
        taskId: 'task-1',
        pluginId: 'plugin-a',
        inputs: { key: 'value' },
      }

      await manager.emit('beforeTaskExecution', payload)

      expect(received).toEqual(payload)
    })

    it('should execute hooks in registration order with same priority', async () => {
      const order: number[] = []

      manager.registerHook('beforeTaskExecution', async () => { order.push(1) })
      manager.registerHook('beforeTaskExecution', async () => { order.push(2) })
      manager.registerHook('beforeTaskExecution', async () => { order.push(3) })

      await manager.emit('beforeTaskExecution', {
        taskId: 'task-1',
        pluginId: 'plugin-a',
        inputs: {},
      })

      expect(order).toEqual([1, 2, 3])
    })

    it('should execute hooks in priority order (lower first)', async () => {
      const order: number[] = []

      manager.registerHook('beforeTaskExecution', async () => { order.push(3) }, 30)
      manager.registerHook('beforeTaskExecution', async () => { order.push(1) }, 1)
      manager.registerHook('beforeTaskExecution', async () => { order.push(2) }, 15)

      await manager.emit('beforeTaskExecution', {
        taskId: 'task-1',
        pluginId: 'plugin-a',
        inputs: {},
      })

      expect(order).toEqual([1, 2, 3])
    })

    it('should handle async hooks correctly', async () => {
      const order: number[] = []

      manager.registerHook('afterTaskExecution', async () => {
        await new Promise((r) => setTimeout(r, 10))
        order.push(1)
      })
      manager.registerHook('afterTaskExecution', async () => {
        order.push(2)
      })

      await manager.emit('afterTaskExecution', {
        taskId: 'task-1',
        pluginId: 'plugin-a',
        status: 'completed',
        duration: 100,
      })

      expect(order).toEqual([1, 2])
    })

    it('should propagate errors from hooks', async () => {
      manager.registerHook('onTaskError', async () => {
        throw new Error('Hook failed')
      })

      const payload: TaskErrorContext = {
        taskId: 'task-1',
        pluginId: 'plugin-a',
        error: new Error('original'),
        inputs: {},
      }

      await expect(manager.emit('onTaskError', payload)).rejects.toThrow('Hook failed')
    })

    it('should do nothing when no hooks are registered', async () => {
      await manager.emit('beforeTaskExecution', {
        taskId: 'task-1',
        pluginId: 'plugin-a',
        inputs: {},
      })
    })

    it('should handle synchronous handlers', async () => {
      let called = false
      const handler: HookHandler<'onPluginLoad'> = () => {
        called = true
      }

      manager.registerHook('onPluginLoad', handler)
      await manager.emit('onPluginLoad', {
        pluginId: 'test',
        version: '1.0.0',
        capabilities: [],
      })

      expect(called).toBe(true)
    })
  })

  describe('hasHooks', () => {
    it('should return false for event with no hooks', () => {
      expect(manager.hasHooks('beforeTaskExecution')).toBe(false)
    })

    it('should return true for event with hooks', () => {
      manager.registerHook('beforeTaskExecution', async () => {})
      expect(manager.hasHooks('beforeTaskExecution')).toBe(true)
    })

    it('should return false after all hooks are removed', () => {
      const handler: HookHandler<'beforeTaskExecution'> = async () => {}
      manager.registerHook('beforeTaskExecution', handler)
      manager.removeHook('beforeTaskExecution', handler)

      expect(manager.hasHooks('beforeTaskExecution')).toBe(false)
    })
  })

  describe('getHooks', () => {
    it('should return empty array for unregistered event', () => {
      expect(manager.getHooks('onPluginUnload')).toEqual([])
    })

    it('should return a copy (not the internal array)', () => {
      manager.registerHook('beforeTaskExecution', async () => {})

      const hooks = manager.getHooks('beforeTaskExecution')
      hooks.push({ event: 'beforeTaskExecution', handler: async () => {}, priority: 99 })

      expect(manager.getHooks('beforeTaskExecution')).toHaveLength(1)
    })
  })

  describe('clear', () => {
    it('should clear all hooks for a specific event', () => {
      manager.registerHook('beforeTaskExecution', async () => {})
      manager.registerHook('beforeTaskExecution', async () => {})
      manager.registerHook('afterTaskExecution', async () => {})

      manager.clear('beforeTaskExecution')

      expect(manager.hasHooks('beforeTaskExecution')).toBe(false)
      expect(manager.hasHooks('afterTaskExecution')).toBe(true)
    })

    it('should clear all hooks when no event specified', () => {
      manager.registerHook('beforeTaskExecution', async () => {})
      manager.registerHook('afterTaskExecution', async () => {})
      manager.registerHook('onPluginLoad', async () => {})

      manager.clear()

      expect(manager.hasHooks('beforeTaskExecution')).toBe(false)
      expect(manager.hasHooks('afterTaskExecution')).toBe(false)
      expect(manager.hasHooks('onPluginLoad')).toBe(false)
    })
  })

  describe('event payloads', () => {
    it('should pass correct payload to beforeTaskExecution', async () => {
      let received: TaskExecutionContext | null = null
      manager.registerHook('beforeTaskExecution', async (p) => { received = p })

      await manager.emit('beforeTaskExecution', {
        taskId: 'task-123',
        pluginId: 'my-plugin',
        inputs: { file: 'test.ts' },
        metadata: { user: 'admin' },
      })

      expect(received!.taskId).toBe('task-123')
      expect(received!.pluginId).toBe('my-plugin')
      expect(received!.inputs).toEqual({ file: 'test.ts' })
      expect(received!.metadata).toEqual({ user: 'admin' })
    })

    it('should pass correct payload to afterTaskExecution', async () => {
      let received: TaskExecutionResult | null = null
      manager.registerHook('afterTaskExecution', async (p) => { received = p })

      await manager.emit('afterTaskExecution', {
        taskId: 'task-123',
        pluginId: 'my-plugin',
        status: 'completed',
        output: { result: 42 },
        duration: 1500,
      })

      expect(received!.status).toBe('completed')
      expect(received!.duration).toBe(1500)
      expect(received!.output).toEqual({ result: 42 })
    })

    it('should pass correct payload to onTaskError', async () => {
      let received: TaskErrorContext | null = null
      manager.registerHook('onTaskError', async (p) => { received = p })

      const err = new Error('something broke')
      await manager.emit('onTaskError', {
        taskId: 'task-123',
        pluginId: 'my-plugin',
        error: err,
        inputs: { attempt: 1 },
      })

      expect(received!.error).toBe(err)
      expect(received!.inputs).toEqual({ attempt: 1 })
    })

    it('should pass correct payload to onPluginLoad', async () => {
      let received: PluginLoadContext | null = null
      manager.registerHook('onPluginLoad', async (p) => { received = p })

      await manager.emit('onPluginLoad', {
        pluginId: 'validator',
        version: '2.1.0',
        capabilities: ['validate', 'lint'],
      })

      expect(received!.pluginId).toBe('validator')
      expect(received!.version).toBe('2.1.0')
      expect(received!.capabilities).toEqual(['validate', 'lint'])
    })

    it('should pass correct payload to onPluginUnload', async () => {
      let received: PluginUnloadContext | null = null
      manager.registerHook('onPluginUnload', async (p) => { received = p })

      await manager.emit('onPluginUnload', {
        pluginId: 'validator',
        reason: 'disabled',
      })

      expect(received!.pluginId).toBe('validator')
      expect(received!.reason).toBe('disabled')
    })
  })
})

describe('Global hook functions', () => {
  beforeEach(() => {
    resetHookManager()
  })

  it('should register and emit via global functions', async () => {
    let called = false
    registerHook('onPluginLoad', async () => { called = true })

    const manager = getHookManager()
    await manager.emit('onPluginLoad', {
      pluginId: 'test',
      version: '1.0.0',
      capabilities: [],
    })

    expect(called).toBe(true)
  })

  it('should remove hooks via global function', () => {
    const handler: HookHandler<'onPluginLoad'> = async () => {}
    registerHook('onPluginLoad', handler)

    const removed = removeHook('onPluginLoad', handler)
    expect(removed).toBe(true)

    const manager = getHookManager()
    expect(manager.hasHooks('onPluginLoad')).toBe(false)
  })

  it('should reuse the same global manager', () => {
    const m1 = getHookManager()
    const m2 = getHookManager()
    expect(m1).toBe(m2)
  })

  it('should reset the global manager', () => {
    const m1 = getHookManager()
    resetHookManager()
    const m2 = getHookManager()
    expect(m1).not.toBe(m2)
  })
})
