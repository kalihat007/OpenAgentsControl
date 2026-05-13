import { describe, expect, it, beforeEach } from 'bun:test'
import {
  PluginRegistry,
  getPluginRegistry,
  resetPluginRegistry,
  type PluginMetadata,
} from '../src/registry.js'
import { HookManager } from '../src/hooks.js'

function createTestPlugin(overrides: Partial<PluginMetadata> = {}): PluginMetadata {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    capabilities: ['execute', 'validate'],
    enabled: true,
    ...overrides,
  }
}

describe('PluginRegistry', () => {
  let registry: PluginRegistry
  let hookManager: HookManager

  beforeEach(() => {
    hookManager = new HookManager()
    registry = new PluginRegistry(hookManager)
  })

  describe('registerPlugin', () => {
    it('should register a plugin', async () => {
      const plugin = createTestPlugin()
      await registry.registerPlugin(plugin)

      expect(registry.hasPlugin('test-plugin')).toBe(true)
      expect(registry.size()).toBe(1)
    })

    it('should store plugin metadata correctly', async () => {
      const plugin = createTestPlugin()
      await registry.registerPlugin(plugin)

      const entry = registry.getPlugin('test-plugin')
      expect(entry).toBeDefined()
      expect(entry!.metadata.id).toBe('test-plugin')
      expect(entry!.metadata.name).toBe('Test Plugin')
      expect(entry!.metadata.version).toBe('1.0.0')
      expect(entry!.metadata.description).toBe('A test plugin')
      expect(entry!.metadata.capabilities).toEqual(['execute', 'validate'])
      expect(entry!.metadata.enabled).toBe(true)
    })

    it('should record registration timestamp', async () => {
      const before = Date.now()
      await registry.registerPlugin(createTestPlugin())
      const after = Date.now()

      const entry = registry.getPlugin('test-plugin')
      expect(entry!.registeredAt).toBeGreaterThanOrEqual(before)
      expect(entry!.registeredAt).toBeLessThanOrEqual(after)
    })

    it('should throw on duplicate registration', async () => {
      await registry.registerPlugin(createTestPlugin())

      await expect(
        registry.registerPlugin(createTestPlugin())
      ).rejects.toThrow("Plugin 'test-plugin' is already registered")
    })

    it('should store plugin instance', async () => {
      const instance = { doWork: () => 'done' }
      await registry.registerPlugin(createTestPlugin(), instance)

      const entry = registry.getPlugin('test-plugin')
      expect(entry!.instance).toBe(instance)
    })

    it('should fire onPluginLoad hook when enabled', async () => {
      let loaded = false
      hookManager.registerHook('onPluginLoad', async (payload) => {
        loaded = true
        expect(payload.pluginId).toBe('test-plugin')
        expect(payload.version).toBe('1.0.0')
        expect(payload.capabilities).toEqual(['execute', 'validate'])
      })

      await registry.registerPlugin(createTestPlugin({ enabled: true }))
      expect(loaded).toBe(true)
    })

    it('should NOT fire onPluginLoad hook when disabled', async () => {
      let loaded = false
      hookManager.registerHook('onPluginLoad', async () => { loaded = true })

      await registry.registerPlugin(createTestPlugin({ enabled: false }))
      expect(loaded).toBe(false)
    })

    it('should register multiple plugins', async () => {
      await registry.registerPlugin(createTestPlugin({ id: 'plugin-a', name: 'Plugin A' }))
      await registry.registerPlugin(createTestPlugin({ id: 'plugin-b', name: 'Plugin B' }))
      await registry.registerPlugin(createTestPlugin({ id: 'plugin-c', name: 'Plugin C' }))

      expect(registry.size()).toBe(3)
    })
  })

  describe('unregisterPlugin', () => {
    it('should remove a registered plugin', async () => {
      await registry.registerPlugin(createTestPlugin())
      const removed = await registry.unregisterPlugin('test-plugin')

      expect(removed).toBe(true)
      expect(registry.hasPlugin('test-plugin')).toBe(false)
      expect(registry.size()).toBe(0)
    })

    it('should return false for non-existent plugin', async () => {
      const removed = await registry.unregisterPlugin('non-existent')
      expect(removed).toBe(false)
    })

    it('should fire onPluginUnload hook for enabled plugin', async () => {
      let unloaded = false
      hookManager.registerHook('onPluginUnload', async (payload) => {
        unloaded = true
        expect(payload.pluginId).toBe('test-plugin')
        expect(payload.reason).toBe('unregistered')
      })

      await registry.registerPlugin(createTestPlugin({ enabled: true }))
      await registry.unregisterPlugin('test-plugin')
      expect(unloaded).toBe(true)
    })

    it('should NOT fire onPluginUnload hook for disabled plugin', async () => {
      let unloaded = false
      hookManager.registerHook('onPluginUnload', async () => { unloaded = true })

      await registry.registerPlugin(createTestPlugin({ enabled: false }))
      await registry.unregisterPlugin('test-plugin')
      expect(unloaded).toBe(false)
    })
  })

  describe('getPlugin', () => {
    it('should return plugin entry', async () => {
      await registry.registerPlugin(createTestPlugin())
      const entry = registry.getPlugin('test-plugin')

      expect(entry).toBeDefined()
      expect(entry!.metadata.id).toBe('test-plugin')
    })

    it('should return undefined for non-existent plugin', () => {
      const entry = registry.getPlugin('non-existent')
      expect(entry).toBeUndefined()
    })
  })

  describe('hasPlugin', () => {
    it('should return true for registered plugin', async () => {
      await registry.registerPlugin(createTestPlugin())
      expect(registry.hasPlugin('test-plugin')).toBe(true)
    })

    it('should return false for non-existent plugin', () => {
      expect(registry.hasPlugin('non-existent')).toBe(false)
    })
  })

  describe('listPlugins', () => {
    beforeEach(async () => {
      await registry.registerPlugin(createTestPlugin({
        id: 'plugin-a',
        name: 'Plugin A',
        enabled: true,
        capabilities: ['execute', 'validate'],
      }))
      await registry.registerPlugin(createTestPlugin({
        id: 'plugin-b',
        name: 'Plugin B',
        enabled: false,
        capabilities: ['validate'],
      }))
      await registry.registerPlugin(createTestPlugin({
        id: 'plugin-c',
        name: 'Plugin C',
        enabled: true,
        capabilities: ['execute', 'monitor'],
      }))
    })

    it('should list all plugins without filter', () => {
      const all = registry.listPlugins()
      expect(all).toHaveLength(3)
    })

    it('should filter by enabled status', () => {
      const enabled = registry.listPlugins({ enabled: true })
      expect(enabled).toHaveLength(2)
      expect(enabled.map((p) => p.id).sort()).toEqual(['plugin-a', 'plugin-c'])
    })

    it('should filter by disabled status', () => {
      const disabled = registry.listPlugins({ enabled: false })
      expect(disabled).toHaveLength(1)
      expect(disabled[0].id).toBe('plugin-b')
    })

    it('should filter by capability', () => {
      const executors = registry.listPlugins({ capability: 'execute' })
      expect(executors).toHaveLength(2)
      expect(executors.map((p) => p.id).sort()).toEqual(['plugin-a', 'plugin-c'])
    })

    it('should combine filters', () => {
      const result = registry.listPlugins({ enabled: true, capability: 'validate' })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('plugin-a')
    })

    it('should return copies of metadata', async () => {
      const list = registry.listPlugins()
      list[0].name = 'Modified'

      const entry = registry.getPlugin(list[0].id)
      expect(entry!.metadata.name).not.toBe('Modified')
    })
  })

  describe('enablePlugin', () => {
    it('should enable a disabled plugin', async () => {
      await registry.registerPlugin(createTestPlugin({ enabled: false }))

      const result = await registry.enablePlugin('test-plugin')
      expect(result).toBe(true)

      const entry = registry.getPlugin('test-plugin')
      expect(entry!.metadata.enabled).toBe(true)
    })

    it('should return true when already enabled', async () => {
      await registry.registerPlugin(createTestPlugin({ enabled: true }))
      const result = await registry.enablePlugin('test-plugin')
      expect(result).toBe(true)
    })

    it('should return false for non-existent plugin', async () => {
      const result = await registry.enablePlugin('non-existent')
      expect(result).toBe(false)
    })

    it('should fire onPluginLoad hook', async () => {
      let loadedId = ''
      hookManager.registerHook('onPluginLoad', async (p) => { loadedId = p.pluginId })

      await registry.registerPlugin(createTestPlugin({ enabled: false }))
      await registry.enablePlugin('test-plugin')

      expect(loadedId).toBe('test-plugin')
    })

    it('should NOT fire onPluginLoad hook if already enabled', async () => {
      let callCount = 0
      hookManager.registerHook('onPluginLoad', async () => { callCount++ })

      await registry.registerPlugin(createTestPlugin({ enabled: true }))
      // One call from registerPlugin
      expect(callCount).toBe(1)

      await registry.enablePlugin('test-plugin')
      // No additional call
      expect(callCount).toBe(1)
    })
  })

  describe('disablePlugin', () => {
    it('should disable an enabled plugin', async () => {
      await registry.registerPlugin(createTestPlugin({ enabled: true }))

      const result = await registry.disablePlugin('test-plugin')
      expect(result).toBe(true)

      const entry = registry.getPlugin('test-plugin')
      expect(entry!.metadata.enabled).toBe(false)
    })

    it('should return true when already disabled', async () => {
      await registry.registerPlugin(createTestPlugin({ enabled: false }))
      const result = await registry.disablePlugin('test-plugin')
      expect(result).toBe(true)
    })

    it('should return false for non-existent plugin', async () => {
      const result = await registry.disablePlugin('non-existent')
      expect(result).toBe(false)
    })

    it('should fire onPluginUnload hook', async () => {
      let unloadedId = ''
      hookManager.registerHook('onPluginUnload', async (p) => { unloadedId = p.pluginId })

      await registry.registerPlugin(createTestPlugin({ enabled: true }))
      await registry.disablePlugin('test-plugin')

      expect(unloadedId).toBe('test-plugin')
    })

    it('should NOT fire onPluginUnload hook if already disabled', async () => {
      let callCount = 0
      hookManager.registerHook('onPluginUnload', async () => { callCount++ })

      await registry.registerPlugin(createTestPlugin({ enabled: false }))
      await registry.disablePlugin('test-plugin')

      expect(callCount).toBe(0)
    })
  })

  describe('getCapabilities', () => {
    it('should return capabilities for a plugin', async () => {
      await registry.registerPlugin(createTestPlugin({
        capabilities: ['execute', 'validate', 'monitor'],
      }))

      const caps = registry.getCapabilities('test-plugin')
      expect(caps).toEqual(['execute', 'validate', 'monitor'])
    })

    it('should return empty array for non-existent plugin', () => {
      const caps = registry.getCapabilities('non-existent')
      expect(caps).toEqual([])
    })

    it('should return a copy (not modify internal state)', async () => {
      await registry.registerPlugin(createTestPlugin({ capabilities: ['execute'] }))

      const caps = registry.getCapabilities('test-plugin')
      caps.push('hacked')

      expect(registry.getCapabilities('test-plugin')).toEqual(['execute'])
    })
  })

  describe('findByCapability', () => {
    it('should find plugins with a given capability', async () => {
      await registry.registerPlugin(createTestPlugin({
        id: 'p1', capabilities: ['execute', 'validate'],
      }))
      await registry.registerPlugin(createTestPlugin({
        id: 'p2', capabilities: ['monitor'],
      }))
      await registry.registerPlugin(createTestPlugin({
        id: 'p3', capabilities: ['execute'],
      }))

      const executors = registry.findByCapability('execute')
      expect(executors).toHaveLength(2)
      expect(executors.map((p) => p.id).sort()).toEqual(['p1', 'p3'])
    })

    it('should return empty array when no match', async () => {
      await registry.registerPlugin(createTestPlugin({ capabilities: ['execute'] }))
      const result = registry.findByCapability('non-existent-cap')
      expect(result).toEqual([])
    })
  })

  describe('size', () => {
    it('should return 0 for empty registry', () => {
      expect(registry.size()).toBe(0)
    })

    it('should track additions', async () => {
      await registry.registerPlugin(createTestPlugin({ id: 'a' }))
      expect(registry.size()).toBe(1)

      await registry.registerPlugin(createTestPlugin({ id: 'b' }))
      expect(registry.size()).toBe(2)
    })

    it('should track removals', async () => {
      await registry.registerPlugin(createTestPlugin({ id: 'a' }))
      await registry.registerPlugin(createTestPlugin({ id: 'b' }))
      await registry.unregisterPlugin('a')
      expect(registry.size()).toBe(1)
    })
  })

  describe('clear', () => {
    it('should remove all plugins', async () => {
      await registry.registerPlugin(createTestPlugin({ id: 'a' }))
      await registry.registerPlugin(createTestPlugin({ id: 'b' }))

      registry.clear()

      expect(registry.size()).toBe(0)
      expect(registry.hasPlugin('a')).toBe(false)
      expect(registry.hasPlugin('b')).toBe(false)
    })
  })
})

describe('Global registry functions', () => {
  beforeEach(() => {
    resetPluginRegistry()
  })

  it('should return a singleton registry', () => {
    const r1 = getPluginRegistry()
    const r2 = getPluginRegistry()
    expect(r1).toBe(r2)
  })

  it('should reset the global registry', () => {
    const r1 = getPluginRegistry()
    resetPluginRegistry()
    const r2 = getPluginRegistry()
    expect(r1).not.toBe(r2)
  })

  it('should accept a hook manager', () => {
    const hm = new HookManager()
    const reg = getPluginRegistry(hm)
    expect(reg).toBeDefined()
  })
})
