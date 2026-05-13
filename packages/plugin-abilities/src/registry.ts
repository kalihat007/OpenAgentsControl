/**
 * Plugin Discovery & Registry
 *
 * Central registry that tracks available plugins, their capabilities, and status.
 * Supports enabling/disabling plugins at runtime.
 */

import {
  HookManager,
  type PluginLoadContext,
  type PluginUnloadContext,
} from './hooks.js'

export interface PluginMetadata {
  id: string
  name: string
  version: string
  description: string
  capabilities: string[]
  enabled: boolean
}

export interface PluginEntry {
  metadata: PluginMetadata
  registeredAt: number
  instance?: unknown
}

export class PluginRegistry {
  private plugins: Map<string, PluginEntry> = new Map()
  private hookManager: HookManager

  constructor(hookManager?: HookManager) {
    this.hookManager = hookManager || new HookManager()
  }

  async registerPlugin(metadata: PluginMetadata, instance?: unknown): Promise<void> {
    if (this.plugins.has(metadata.id)) {
      throw new Error(`Plugin '${metadata.id}' is already registered`)
    }

    this.plugins.set(metadata.id, {
      metadata: { ...metadata },
      registeredAt: Date.now(),
      instance,
    })

    if (metadata.enabled) {
      await this.hookManager.emit('onPluginLoad', {
        pluginId: metadata.id,
        version: metadata.version,
        capabilities: metadata.capabilities,
      } satisfies PluginLoadContext)
    }
  }

  async unregisterPlugin(id: string): Promise<boolean> {
    const entry = this.plugins.get(id)
    if (!entry) return false

    if (entry.metadata.enabled) {
      await this.hookManager.emit('onPluginUnload', {
        pluginId: id,
        reason: 'unregistered',
      } satisfies PluginUnloadContext)
    }

    this.plugins.delete(id)
    return true
  }

  getPlugin(id: string): PluginEntry | undefined {
    return this.plugins.get(id)
  }

  hasPlugin(id: string): boolean {
    return this.plugins.has(id)
  }

  listPlugins(filter?: { enabled?: boolean; capability?: string }): PluginMetadata[] {
    let entries = Array.from(this.plugins.values())

    if (filter?.enabled !== undefined) {
      entries = entries.filter((e) => e.metadata.enabled === filter.enabled)
    }

    if (filter?.capability) {
      const cap = filter.capability
      entries = entries.filter((e) => e.metadata.capabilities.includes(cap))
    }

    return entries.map((e) => ({ ...e.metadata }))
  }

  async enablePlugin(id: string): Promise<boolean> {
    const entry = this.plugins.get(id)
    if (!entry) return false
    if (entry.metadata.enabled) return true

    entry.metadata.enabled = true

    await this.hookManager.emit('onPluginLoad', {
      pluginId: id,
      version: entry.metadata.version,
      capabilities: entry.metadata.capabilities,
    } satisfies PluginLoadContext)

    return true
  }

  async disablePlugin(id: string): Promise<boolean> {
    const entry = this.plugins.get(id)
    if (!entry) return false
    if (!entry.metadata.enabled) return true

    entry.metadata.enabled = false

    await this.hookManager.emit('onPluginUnload', {
      pluginId: id,
      reason: 'disabled',
    } satisfies PluginUnloadContext)

    return true
  }

  getCapabilities(id: string): string[] {
    const entry = this.plugins.get(id)
    return entry ? [...entry.metadata.capabilities] : []
  }

  findByCapability(capability: string): PluginMetadata[] {
    return this.listPlugins({ capability })
  }

  size(): number {
    return this.plugins.size
  }

  clear(): void {
    this.plugins.clear()
  }
}

let globalRegistry: PluginRegistry | null = null

export function getPluginRegistry(hookManager?: HookManager): PluginRegistry {
  if (!globalRegistry) {
    globalRegistry = new PluginRegistry(hookManager)
  }
  return globalRegistry
}

export function resetPluginRegistry(): void {
  globalRegistry = null
}
