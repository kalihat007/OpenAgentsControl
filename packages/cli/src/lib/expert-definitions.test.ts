import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  loadBuiltInExperts,
  loadCustomExperts,
  saveCustomExperts,
  createExpertRegistry,
  resolveInheritance,
  validateExpertDefinition,
  validateRegistry,
  addCustomExpert,
  updateCustomExpert,
  removeCustomExpert,
  enableExpert,
  disableExpert,
  scaffoldExpertFile,
  exportExpert,
  type ExpertDefinition,
  type ExpertDefinitionFile,
  type ExpertRegistry,
} from './expert-definitions.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeExpert(overrides: Partial<ExpertDefinition> = {}): ExpertDefinition {
  return {
    id: 'test-expert',
    name: 'TestExpert',
    description: 'A test expert',
    role: 'tester',
    capabilities: ['testing'],
    keywords: ['test'],
    filePatterns: ['*.test.ts'],
    enabled: true,
    ...overrides,
  }
}

async function writeExpertsFile(
  projectRoot: string,
  content: ExpertDefinitionFile,
): Promise<void> {
  const dir = join(projectRoot, '.opencode')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'experts.json'),
    JSON.stringify(content, null, 2),
    'utf-8',
  )
}

async function writeRawExpertsFile(
  projectRoot: string,
  content: string,
): Promise<void> {
  const dir = join(projectRoot, '.opencode')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'experts.json'), content, 'utf-8')
}

// ── Built-in expert loading ───────────────────────────────────────────────────

describe('loadBuiltInExperts', () => {
  it('returns a non-empty array', () => {
    const experts = loadBuiltInExperts()
    expect(experts.length).toBeGreaterThan(0)
  })

  it('includes CoderAgent', () => {
    const experts = loadBuiltInExperts()
    const coder = experts.find((e) => e.name === 'CoderAgent')
    expect(coder).toBeDefined()
    expect(coder!.keywords).toContain('implement')
    expect(coder!.role).toBe('developer')
  })

  it('includes OpenFrontendSpecialist', () => {
    const experts = loadBuiltInExperts()
    expect(experts.some((e) => e.name === 'OpenFrontendSpecialist')).toBe(true)
  })

  it('all built-in experts are enabled by default', () => {
    const experts = loadBuiltInExperts()
    for (const expert of experts) {
      expect(expert.enabled).toBe(true)
    }
  })

  it('all built-in experts have lowercase hyphenated IDs', () => {
    const experts = loadBuiltInExperts()
    for (const expert of experts) {
      expect(expert.id).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('all built-in experts have required fields', () => {
    const experts = loadBuiltInExperts()
    for (const expert of experts) {
      expect(expert.id).toBeTruthy()
      expect(expert.name).toBeTruthy()
      expect(expert.description).toBeTruthy()
      expect(expert.role).toBeTruthy()
      expect(Array.isArray(expert.capabilities)).toBe(true)
      expect(Array.isArray(expert.keywords)).toBe(true)
      expect(Array.isArray(expert.filePatterns)).toBe(true)
    }
  })

  it('returns independent copies on each call', () => {
    const a = loadBuiltInExperts()
    const b = loadBuiltInExperts()
    a[0]!.name = 'MUTATED'
    expect(b[0]!.name).not.toBe('MUTATED')
  })
})

// ── Custom expert loading ─────────────────────────────────────────────────────

describe('loadCustomExperts', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'oac-expert-load-'))
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('returns empty array when no file exists', async () => {
    const result = await loadCustomExperts(join(tmpDir, 'nonexistent'))
    expect(result).toEqual([])
  })

  it('loads experts from a valid JSON file', async () => {
    const projectRoot = join(tmpDir, 'valid')
    const expert = makeExpert({ id: 'custom-one', name: 'CustomOne' })
    await writeExpertsFile(projectRoot, { version: '1', experts: [expert] })

    const result = await loadCustomExperts(projectRoot)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('custom-one')
    expect(result[0]!.name).toBe('CustomOne')
  })

  it('returns empty array for empty file', async () => {
    const projectRoot = join(tmpDir, 'empty-file')
    await writeRawExpertsFile(projectRoot, '')

    const result = await loadCustomExperts(projectRoot)
    expect(result).toEqual([])
  })

  it('returns empty array for invalid JSON', async () => {
    const projectRoot = join(tmpDir, 'bad-json')
    await writeRawExpertsFile(projectRoot, '{ not valid json }}}')

    const result = await loadCustomExperts(projectRoot)
    expect(result).toEqual([])
  })

  it('returns empty array for JSON missing version field', async () => {
    const projectRoot = join(tmpDir, 'no-version')
    await writeRawExpertsFile(projectRoot, JSON.stringify({ experts: [] }))

    const result = await loadCustomExperts(projectRoot)
    expect(result).toEqual([])
  })

  it('returns empty array for JSON missing experts field', async () => {
    const projectRoot = join(tmpDir, 'no-experts')
    await writeRawExpertsFile(projectRoot, JSON.stringify({ version: '1' }))

    const result = await loadCustomExperts(projectRoot)
    expect(result).toEqual([])
  })

  it('returns empty array when experts is not an array', async () => {
    const projectRoot = join(tmpDir, 'experts-not-array')
    await writeRawExpertsFile(
      projectRoot,
      JSON.stringify({ version: '1', experts: 'not-an-array' }),
    )

    const result = await loadCustomExperts(projectRoot)
    expect(result).toEqual([])
  })

  it('loads multiple experts', async () => {
    const projectRoot = join(tmpDir, 'multi')
    const experts = [
      makeExpert({ id: 'alpha', name: 'Alpha' }),
      makeExpert({ id: 'beta', name: 'Beta' }),
    ]
    await writeExpertsFile(projectRoot, { version: '1', experts })

    const result = await loadCustomExperts(projectRoot)
    expect(result).toHaveLength(2)
  })
})

// ── saveCustomExperts ─────────────────────────────────────────────────────────

describe('saveCustomExperts', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'oac-expert-save-'))
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('creates the .opencode directory and writes experts.json', async () => {
    const projectRoot = join(tmpDir, 'save-test')
    const expert = makeExpert()
    await saveCustomExperts(projectRoot, [expert])

    const raw = await readFile(join(projectRoot, '.opencode', 'experts.json'), 'utf-8')
    const parsed = JSON.parse(raw) as ExpertDefinitionFile
    expect(parsed.version).toBe('1')
    expect(parsed.experts).toHaveLength(1)
    expect(parsed.experts[0]!.id).toBe('test-expert')
  })

  it('round-trips with loadCustomExperts', async () => {
    const projectRoot = join(tmpDir, 'roundtrip')
    const expert = makeExpert({ id: 'rt-expert', name: 'RoundTrip' })
    await saveCustomExperts(projectRoot, [expert])

    const loaded = await loadCustomExperts(projectRoot)
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.id).toBe('rt-expert')
    expect(loaded[0]!.name).toBe('RoundTrip')
  })
})

// ── createExpertRegistry ──────────────────────────────────────────────────────

describe('createExpertRegistry', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'oac-expert-registry-'))
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('returns built-in experts when no custom file exists', async () => {
    const registry = await createExpertRegistry(join(tmpDir, 'no-custom'))
    expect(registry.builtIn.length).toBeGreaterThan(0)
    expect(registry.custom).toHaveLength(0)
    expect(registry.merged.length).toBe(registry.builtIn.length)
  })

  it('merges built-in and custom experts', async () => {
    const projectRoot = join(tmpDir, 'with-custom')
    const custom = makeExpert({ id: 'unique-custom', name: 'UniqueCustom' })
    await writeExpertsFile(projectRoot, { version: '1', experts: [custom] })

    const registry = await createExpertRegistry(projectRoot)
    expect(registry.custom).toHaveLength(1)
    expect(registry.merged.length).toBe(registry.builtIn.length + 1)
    expect(registry.merged.some((e) => e.id === 'unique-custom')).toBe(true)
  })

  it('custom expert overrides built-in with same ID', async () => {
    const projectRoot = join(tmpDir, 'override')
    const builtIn = loadBuiltInExperts()
    const coderBuiltIn = builtIn.find((e) => e.name === 'CoderAgent')!
    const override = makeExpert({
      id: coderBuiltIn.id,
      name: 'OverriddenCoder',
      description: 'Custom coder override',
    })
    await writeExpertsFile(projectRoot, { version: '1', experts: [override] })

    const registry = await createExpertRegistry(projectRoot)
    const merged = registry.merged.find((e) => e.id === coderBuiltIn.id)
    expect(merged!.name).toBe('OverriddenCoder')
    expect(merged!.description).toBe('Custom coder override')
  })
})

// ── Inheritance resolution ────────────────────────────────────────────────────

describe('resolveInheritance', () => {
  it('returns a copy when expert has no extends', () => {
    const expert = makeExpert()
    const resolved = resolveInheritance(expert, [expert])
    expect(resolved).toEqual(expert)
    expect(resolved).not.toBe(expert)
  })

  it('merges parent properties into child', () => {
    const parent = makeExpert({
      id: 'parent',
      name: 'Parent',
      description: 'Parent description',
      role: 'parent-role',
      capabilities: ['cap-a'],
      keywords: ['kw-a'],
      filePatterns: ['*.parent'],
      instructions: 'Parent instructions',
    })

    const child = makeExpert({
      id: 'child',
      name: 'Child',
      description: 'Child description',
      role: 'child-role',
      capabilities: ['cap-b'],
      keywords: ['kw-b'],
      filePatterns: ['*.child'],
      extends: 'parent',
    })

    const resolved = resolveInheritance(child, [parent, child])

    expect(resolved.id).toBe('child')
    expect(resolved.name).toBe('Child')
    expect(resolved.description).toBe('Child description')
    expect(resolved.role).toBe('child-role')
    // Additive
    expect(resolved.capabilities).toContain('cap-a')
    expect(resolved.capabilities).toContain('cap-b')
    expect(resolved.keywords).toContain('kw-a')
    expect(resolved.keywords).toContain('kw-b')
    expect(resolved.filePatterns).toContain('*.parent')
    expect(resolved.filePatterns).toContain('*.child')
  })

  it('child instructions replace parent instructions', () => {
    const parent = makeExpert({
      id: 'parent',
      instructions: 'Parent instructions',
    })
    const child = makeExpert({
      id: 'child',
      instructions: 'Child instructions',
      extends: 'parent',
    })

    const resolved = resolveInheritance(child, [parent, child])
    expect(resolved.instructions).toBe('Child instructions')
  })

  it('inherits parent instructions when child has none', () => {
    const parent = makeExpert({
      id: 'parent',
      instructions: 'Parent instructions',
    })
    const child = makeExpert({
      id: 'child',
      extends: 'parent',
    })
    delete child.instructions

    const resolved = resolveInheritance(child, [parent, child])
    expect(resolved.instructions).toBe('Parent instructions')
  })

  it('resolves multi-level inheritance', () => {
    const grandparent = makeExpert({
      id: 'grandparent',
      capabilities: ['gp-cap'],
      keywords: ['gp-kw'],
      filePatterns: ['*.gp'],
    })
    const parent = makeExpert({
      id: 'parent',
      capabilities: ['p-cap'],
      keywords: ['p-kw'],
      filePatterns: ['*.p'],
      extends: 'grandparent',
    })
    const child = makeExpert({
      id: 'child',
      capabilities: ['c-cap'],
      keywords: ['c-kw'],
      filePatterns: ['*.c'],
      extends: 'parent',
    })

    const all = [grandparent, parent, child]
    const resolved = resolveInheritance(child, all)

    expect(resolved.capabilities).toContain('gp-cap')
    expect(resolved.capabilities).toContain('p-cap')
    expect(resolved.capabilities).toContain('c-cap')
    expect(resolved.keywords).toContain('gp-kw')
    expect(resolved.keywords).toContain('p-kw')
    expect(resolved.keywords).toContain('c-kw')
    expect(resolved.filePatterns).toContain('*.gp')
    expect(resolved.filePatterns).toContain('*.p')
    expect(resolved.filePatterns).toContain('*.c')
  })

  it('deduplicates additive properties', () => {
    const parent = makeExpert({
      id: 'parent',
      capabilities: ['shared-cap'],
      keywords: ['shared-kw'],
    })
    const child = makeExpert({
      id: 'child',
      capabilities: ['shared-cap', 'unique-cap'],
      keywords: ['shared-kw', 'unique-kw'],
      extends: 'parent',
    })

    const resolved = resolveInheritance(child, [parent, child])
    const capCount = resolved.capabilities.filter((c) => c === 'shared-cap').length
    expect(capCount).toBe(1)
    const kwCount = resolved.keywords.filter((k) => k === 'shared-kw').length
    expect(kwCount).toBe(1)
  })

  it('throws on circular inheritance', () => {
    const a = makeExpert({ id: 'a', extends: 'b' })
    const b = makeExpert({ id: 'b', extends: 'a' })

    expect(() => resolveInheritance(a, [a, b])).toThrow(/[Cc]ircular/)
  })

  it('throws when parent is not found', () => {
    const child = makeExpert({ id: 'child', extends: 'nonexistent' })

    expect(() => resolveInheritance(child, [child])).toThrow(/not found/)
  })

  it('child description replaces empty parent description via fallback', () => {
    const parent = makeExpert({ id: 'parent', description: '' })
    const child = makeExpert({
      id: 'child',
      description: 'Child desc',
      extends: 'parent',
    })

    const resolved = resolveInheritance(child, [parent, child])
    expect(resolved.description).toBe('Child desc')
  })
})

// ── Validation ────────────────────────────────────────────────────────────────

describe('validateExpertDefinition', () => {
  it('valid expert passes validation', () => {
    const result = validateExpertDefinition(makeExpert())
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects missing id', () => {
    const result = validateExpertDefinition(makeExpert({ id: '' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('id'))).toBe(true)
  })

  it('rejects invalid id format', () => {
    const result = validateExpertDefinition(makeExpert({ id: 'Invalid_ID!' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('id'))).toBe(true)
  })

  it('rejects missing name', () => {
    const result = validateExpertDefinition(makeExpert({ name: '' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('name'))).toBe(true)
  })

  it('rejects missing description', () => {
    const result = validateExpertDefinition(makeExpert({ description: '' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('description'))).toBe(true)
  })

  it('rejects missing role', () => {
    const result = validateExpertDefinition(makeExpert({ role: '' }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('role'))).toBe(true)
  })

  it('rejects non-boolean enabled', () => {
    const expert = makeExpert()
    ;(expert as unknown as Record<string, unknown>).enabled = 'yes'
    const result = validateExpertDefinition(expert)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('enabled'))).toBe(true)
  })

  it('warns on empty capabilities', () => {
    const result = validateExpertDefinition(makeExpert({ capabilities: [] }))
    expect(result.valid).toBe(true)
    expect(result.warnings.some((w) => w.includes('capabilities'))).toBe(true)
  })

  it('warns on empty keywords', () => {
    const result = validateExpertDefinition(makeExpert({ keywords: [] }))
    expect(result.valid).toBe(true)
    expect(result.warnings.some((w) => w.includes('keywords'))).toBe(true)
  })

  it('rejects non-array capabilities', () => {
    const expert = makeExpert()
    ;(expert as unknown as Record<string, unknown>).capabilities = 'not-an-array'
    const result = validateExpertDefinition(expert)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('capabilities'))).toBe(true)
  })

  it('rejects non-finite priority', () => {
    const result = validateExpertDefinition(makeExpert({ priority: Infinity }))
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('priority'))).toBe(true)
  })

  it('accepts valid priority', () => {
    const result = validateExpertDefinition(makeExpert({ priority: 10 }))
    expect(result.valid).toBe(true)
  })

  it('accepts valid instructions', () => {
    const result = validateExpertDefinition(
      makeExpert({ instructions: 'Some instructions' }),
    )
    expect(result.valid).toBe(true)
  })

  it('rejects non-string instructions', () => {
    const expert = makeExpert()
    ;(expert as unknown as Record<string, unknown>).instructions = 42
    const result = validateExpertDefinition(expert)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('instructions'))).toBe(true)
  })
})

describe('validateRegistry', () => {
  it('valid registry passes', () => {
    const builtIn = loadBuiltInExperts()
    const custom = [makeExpert({ id: 'valid-custom', name: 'ValidCustom' })]
    const merged = [...builtIn, ...custom]
    const registry: ExpertRegistry = { builtIn, custom, merged }

    const result = validateRegistry(registry)
    expect(result.valid).toBe(true)
  })

  it('detects duplicate custom expert IDs', () => {
    const builtIn = loadBuiltInExperts()
    const custom = [
      makeExpert({ id: 'dupe', name: 'Dupe1' }),
      makeExpert({ id: 'dupe', name: 'Dupe2' }),
    ]
    const merged = [...builtIn, ...custom]
    const registry: ExpertRegistry = { builtIn, custom, merged }

    const result = validateRegistry(registry)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Duplicate'))).toBe(true)
  })

  it('detects orphan extends references', () => {
    const builtIn = loadBuiltInExperts()
    const custom = [makeExpert({ id: 'orphan', extends: 'nonexistent-parent' })]
    const merged = [...builtIn, ...custom]
    const registry: ExpertRegistry = { builtIn, custom, merged }

    const result = validateRegistry(registry)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('unknown expert'))).toBe(true)
  })

  it('detects circular extends chains', () => {
    const builtIn = loadBuiltInExperts()
    const a = makeExpert({ id: 'circ-a', name: 'CircA', extends: 'circ-b' })
    const b = makeExpert({ id: 'circ-b', name: 'CircB', extends: 'circ-a' })
    const custom = [a, b]
    const merged = [...builtIn, ...custom]
    const registry: ExpertRegistry = { builtIn, custom, merged }

    const result = validateRegistry(registry)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('ircular'))).toBe(true)
  })

  it('warns when custom expert shadows a built-in', () => {
    const builtIn = loadBuiltInExperts()
    const shadowId = builtIn[0]!.id
    const custom = [makeExpert({ id: shadowId, name: 'Shadow' })]
    const merged = [...builtIn, ...custom]
    const registry: ExpertRegistry = { builtIn, custom, merged }

    const result = validateRegistry(registry)
    expect(result.warnings.some((w) => w.includes('overrides'))).toBe(true)
  })

  it('propagates validation errors from individual experts', () => {
    const builtIn = loadBuiltInExperts()
    const bad = makeExpert({ id: '', name: '' })
    const custom = [bad]
    const merged = [...builtIn, ...custom]
    const registry: ExpertRegistry = { builtIn, custom, merged }

    const result = validateRegistry(registry)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

// ── CRUD operations ───────────────────────────────────────────────────────────

describe('CRUD operations', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'oac-expert-crud-'))
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe('addCustomExpert', () => {
    it('adds a new expert and returns updated registry', async () => {
      const projectRoot = join(tmpDir, 'add-test')
      const expert = makeExpert({ id: 'new-expert', name: 'NewExpert' })

      const registry = await addCustomExpert(projectRoot, expert)
      expect(registry.custom).toHaveLength(1)
      expect(registry.custom[0]!.id).toBe('new-expert')
      expect(registry.merged.some((e) => e.id === 'new-expert')).toBe(true)
    })

    it('throws when adding duplicate ID', async () => {
      const projectRoot = join(tmpDir, 'add-dupe')
      const expert = makeExpert({ id: 'dup-id', name: 'First' })
      await addCustomExpert(projectRoot, expert)

      const dup = makeExpert({ id: 'dup-id', name: 'Second' })
      await expect(addCustomExpert(projectRoot, dup)).rejects.toThrow(/already exists/)
    })

    it('throws for invalid expert definition', async () => {
      const projectRoot = join(tmpDir, 'add-invalid')
      const invalid = makeExpert({ id: '' })

      await expect(addCustomExpert(projectRoot, invalid)).rejects.toThrow(/Invalid/)
    })
  })

  describe('updateCustomExpert', () => {
    it('updates an existing expert', async () => {
      const projectRoot = join(tmpDir, 'update-test')
      const expert = makeExpert({ id: 'upd-expert', name: 'Original' })
      await addCustomExpert(projectRoot, expert)

      const registry = await updateCustomExpert(projectRoot, 'upd-expert', {
        name: 'Updated',
        description: 'Updated description',
      })

      const updated = registry.custom.find((e) => e.id === 'upd-expert')
      expect(updated!.name).toBe('Updated')
      expect(updated!.description).toBe('Updated description')
    })

    it('throws when expert not found', async () => {
      const projectRoot = join(tmpDir, 'update-missing')
      await expect(
        updateCustomExpert(projectRoot, 'nonexistent', { name: 'Nope' }),
      ).rejects.toThrow(/not found/)
    })

    it('preserves the ID even if updates try to change it', async () => {
      const projectRoot = join(tmpDir, 'update-id-guard')
      const expert = makeExpert({ id: 'id-guard', name: 'Guard' })
      await addCustomExpert(projectRoot, expert)

      const registry = await updateCustomExpert(projectRoot, 'id-guard', {
        id: 'new-id' as string,
        name: 'StillGuarded',
      })

      expect(registry.custom.some((e) => e.id === 'id-guard')).toBe(true)
    })
  })

  describe('removeCustomExpert', () => {
    it('removes an existing expert', async () => {
      const projectRoot = join(tmpDir, 'remove-test')
      const expert = makeExpert({ id: 'rm-expert', name: 'ToRemove' })
      await addCustomExpert(projectRoot, expert)

      const registry = await removeCustomExpert(projectRoot, 'rm-expert')
      expect(registry.custom).toHaveLength(0)
      expect(registry.merged.some((e) => e.id === 'rm-expert')).toBe(false)
    })

    it('throws when expert not found', async () => {
      const projectRoot = join(tmpDir, 'remove-missing')
      await expect(removeCustomExpert(projectRoot, 'nonexistent')).rejects.toThrow(/not found/)
    })
  })

  describe('enableExpert / disableExpert', () => {
    it('disables an expert', () => {
      const builtIn = loadBuiltInExperts()
      const registry: ExpertRegistry = { builtIn, custom: [], merged: [...builtIn] }
      const targetId = builtIn[0]!.id

      const updated = disableExpert(registry, targetId)
      const expert = updated.merged.find((e) => e.id === targetId)
      expect(expert!.enabled).toBe(false)
    })

    it('enables a disabled expert', () => {
      const builtIn = loadBuiltInExperts().map((e) => ({ ...e, enabled: false }))
      const registry: ExpertRegistry = { builtIn, custom: [], merged: [...builtIn] }
      const targetId = builtIn[0]!.id

      const updated = enableExpert(registry, targetId)
      const expert = updated.merged.find((e) => e.id === targetId)
      expect(expert!.enabled).toBe(true)
    })

    it('throws when expert not found', () => {
      const registry: ExpertRegistry = {
        builtIn: loadBuiltInExperts(),
        custom: [],
        merged: loadBuiltInExperts(),
      }
      expect(() => disableExpert(registry, 'nonexistent')).toThrow(/not found/)
      expect(() => enableExpert(registry, 'nonexistent')).toThrow(/not found/)
    })

    it('does not mutate the original registry', () => {
      const builtIn = loadBuiltInExperts()
      const registry: ExpertRegistry = { builtIn, custom: [], merged: [...builtIn] }
      const targetId = builtIn[0]!.id

      disableExpert(registry, targetId)
      expect(registry.merged.find((e) => e.id === targetId)!.enabled).toBe(true)
    })
  })
})

// ── Scaffolding ───────────────────────────────────────────────────────────────

describe('scaffoldExpertFile', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'oac-expert-scaffold-'))
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('creates a starter experts.json', async () => {
    const projectRoot = join(tmpDir, 'scaffold-test')
    await scaffoldExpertFile(projectRoot)

    const raw = await readFile(
      join(projectRoot, '.opencode', 'experts.json'),
      'utf-8',
    )
    const parsed = JSON.parse(raw) as ExpertDefinitionFile
    expect(parsed.version).toBe('1')
    expect(parsed.experts.length).toBeGreaterThan(0)
    expect(parsed.experts[0]!.id).toBe('my-custom-expert')
  })

  it('does not overwrite an existing file', async () => {
    const projectRoot = join(tmpDir, 'scaffold-existing')
    const expert = makeExpert({ id: 'keep-me', name: 'KeepMe' })
    await writeExpertsFile(projectRoot, { version: '1', experts: [expert] })

    await scaffoldExpertFile(projectRoot)

    const loaded = await loadCustomExperts(projectRoot)
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.id).toBe('keep-me')
  })

  it('created file is loadable by loadCustomExperts', async () => {
    const projectRoot = join(tmpDir, 'scaffold-loadable')
    await scaffoldExpertFile(projectRoot)

    const loaded = await loadCustomExperts(projectRoot)
    expect(loaded.length).toBeGreaterThan(0)
    expect(loaded[0]!.name).toBe('MyCustomExpert')
  })
})

// ── exportExpert ──────────────────────────────────────────────────────────────

describe('exportExpert', () => {
  it('exports a built-in expert', () => {
    const builtIn = loadBuiltInExperts()
    const registry: ExpertRegistry = { builtIn, custom: [], merged: [...builtIn] }
    const targetId = builtIn[0]!.id

    const exported = exportExpert(registry, targetId)
    expect(exported.id).toBe(targetId)
    expect(exported).not.toBe(builtIn[0])
  })

  it('exports a custom expert', () => {
    const builtIn = loadBuiltInExperts()
    const custom = [makeExpert({ id: 'exportable', name: 'Exportable' })]
    const merged = [...builtIn, ...custom]
    const registry: ExpertRegistry = { builtIn, custom, merged }

    const exported = exportExpert(registry, 'exportable')
    expect(exported.id).toBe('exportable')
    expect(exported.name).toBe('Exportable')
  })

  it('throws when expert not found', () => {
    const registry: ExpertRegistry = {
      builtIn: loadBuiltInExperts(),
      custom: [],
      merged: loadBuiltInExperts(),
    }
    expect(() => exportExpert(registry, 'nonexistent')).toThrow(/not found/)
  })

  it('returns a copy, not a reference', () => {
    const builtIn = loadBuiltInExperts()
    const registry: ExpertRegistry = { builtIn, custom: [], merged: [...builtIn] }
    const targetId = builtIn[0]!.id

    const exported = exportExpert(registry, targetId)
    exported.name = 'MUTATED'
    expect(registry.merged.find((e) => e.id === targetId)!.name).not.toBe('MUTATED')
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('edge cases', () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'oac-expert-edge-'))
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('handles whitespace-only file gracefully', async () => {
    const projectRoot = join(tmpDir, 'whitespace')
    await writeRawExpertsFile(projectRoot, '   \n  \t  ')

    const result = await loadCustomExperts(projectRoot)
    expect(result).toEqual([])
  })

  it('CRUD works on a freshly scaffolded file', async () => {
    const projectRoot = join(tmpDir, 'scaffold-then-crud')
    await scaffoldExpertFile(projectRoot)

    const newExpert = makeExpert({ id: 'post-scaffold', name: 'PostScaffold' })
    const registry = await addCustomExpert(projectRoot, newExpert)
    expect(registry.custom.some((e) => e.id === 'post-scaffold')).toBe(true)
    expect(registry.custom.some((e) => e.id === 'my-custom-expert')).toBe(true)
  })

  it('registry with zero custom experts still validates', () => {
    const builtIn = loadBuiltInExperts()
    const registry: ExpertRegistry = { builtIn, custom: [], merged: [...builtIn] }

    const result = validateRegistry(registry)
    expect(result.valid).toBe(true)
  })

  it('built-in expert count matches the known expert set', () => {
    const experts = loadBuiltInExperts()
    expect(experts.length).toBe(18)
  })

  it('all built-in experts have unique IDs', () => {
    const experts = loadBuiltInExperts()
    const ids = experts.map((e) => e.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })
})
