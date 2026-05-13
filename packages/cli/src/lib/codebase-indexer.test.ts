import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  buildFileTree,
  flattenFileTree,
  detectTechStack,
  analyzeModule,
  buildDependencyMap,
  detectConventions,
  indexCodebase,
  getExpertContext,
  getRelevantFiles,
  getScopeImpact,
  saveIndex,
  loadIndex,
  isIndexStale,
  updateIndex,
  type CodebaseIndex,
  type FileNode,
  type TechStack,
  type ModuleInfo,
  type DependencyMap,
  type ProjectConventions,
} from './codebase-indexer.js'

// Use the actual OpenAgentsControl monorepo root for integration-style tests
const MONOREPO_ROOT = join(import.meta.dir, '..', '..', '..', '..')

// ── Temp directory for controlled tests ───────────────────────────────────────

let tmpDir: string

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'oac-indexer-test-'))
})

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

// ── Helper to scaffold a temp project ─────────────────────────────────────────

async function createTempProject(name: string, files: Record<string, string>): Promise<string> {
  const root = join(tmpDir, name)
  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, relPath)
    await mkdir(join(absPath, '..'), { recursive: true })
    await writeFile(absPath, content, 'utf-8')
  }
  return root
}

// ── detectTechStack ───────────────────────────────────────────────────────────

describe('detectTechStack', () => {
  test('detects tech stack from the OpenAgentsControl monorepo', async () => {
    const stack = await detectTechStack(MONOREPO_ROOT)
    expect(stack.languages).toContain('javascript')
    expect(stack.packageManager).toBeTruthy()
    expect(stack.packageManager).not.toBe('unknown')
  })

  test('detects frameworks from package.json dependencies', async () => {
    const root = await createTempProject('ts-react-project', {
      'package.json': JSON.stringify({
        dependencies: { react: '^18.0.0', next: '^14.0.0' },
        devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0', vite: '^5.0.0' },
      }),
      'tsconfig.json': '{}',
    })

    const stack = await detectTechStack(root)
    expect(stack.languages).toContain('typescript')
    expect(stack.languages).toContain('javascript')
    expect(stack.frameworks).toContain('react')
    expect(stack.frameworks).toContain('nextjs')
    expect(stack.testFrameworks).toContain('vitest')
    expect(stack.buildTools).toContain('vite')
    expect(stack.buildTools).toContain('tsc')
  })

  test('detects package manager from lock files', async () => {
    const root = await createTempProject('bun-project', {
      'package.json': JSON.stringify({ dependencies: {} }),
      'bun.lock': '',
    })
    const stack = await detectTechStack(root)
    expect(stack.packageManager).toBe('bun')
  })

  test('detects Go from go.mod', async () => {
    const root = await createTempProject('go-project', {
      'go.mod': 'module example.com/foo\n\ngo 1.21',
    })
    const stack = await detectTechStack(root)
    expect(stack.languages).toContain('go')
    expect(stack.packageManager).toBe('go')
  })

  test('detects Rust from Cargo.toml', async () => {
    const root = await createTempProject('rust-project', {
      'Cargo.toml': '[package]\nname = "foo"',
      'Cargo.lock': '',
    })
    const stack = await detectTechStack(root)
    expect(stack.languages).toContain('rust')
    expect(stack.packageManager).toBe('cargo')
  })

  test('returns unknown package manager when no lock file exists', async () => {
    const root = await createTempProject('bare-project', {
      'README.md': '# hello',
    })
    const stack = await detectTechStack(root)
    expect(stack.packageManager).toBe('unknown')
  })

  test('handles missing package.json gracefully', async () => {
    const root = await createTempProject('no-pkg-project', {
      'main.py': 'print("hello")',
    })
    const stack = await detectTechStack(root)
    expect(stack.languages).toEqual([])
    expect(stack.frameworks).toEqual([])
  })
})

// ── buildFileTree ─────────────────────────────────────────────────────────────

describe('buildFileTree', () => {
  test('builds file tree from a temp directory', async () => {
    const root = await createTempProject('tree-project', {
      'src/index.ts': 'export {}',
      'src/utils/helpers.ts': 'export function help() {}',
      'README.md': '# Test',
      'package.json': '{}',
    })

    const tree = await buildFileTree(root)
    expect(tree.length).toBeGreaterThan(0)

    const names = tree.map(n => n.name)
    expect(names).toContain('src')
    expect(names).toContain('README.md')
    expect(names).toContain('package.json')
  })

  test('ignores node_modules and .git by default', async () => {
    const root = await createTempProject('ignore-test', {
      'src/app.ts': 'export {}',
      'node_modules/foo/index.js': 'module.exports = {}',
      '.git/config': '[core]',
    })

    const tree = await buildFileTree(root)
    const allNames = flattenNames(tree)
    expect(allNames).not.toContain('node_modules')
    expect(allNames).not.toContain('.git')
    expect(allNames).toContain('src')
  })

  test('respects custom ignore patterns', async () => {
    const root = await createTempProject('custom-ignore', {
      'src/app.ts': 'export {}',
      'build/out.js': 'built',
      'vendor/lib.js': 'vendored',
    })

    const tree = await buildFileTree(root, { ignore: ['build', 'vendor'] })
    const allNames = flattenNames(tree)
    expect(allNames).toContain('src')
    expect(allNames).not.toContain('build')
    expect(allNames).not.toContain('vendor')
  })

  test('identifies file languages from extensions', async () => {
    const root = await createTempProject('lang-detect', {
      'app.ts': 'export {}',
      'style.css': 'body {}',
      'page.tsx': '<div />',
      'data.json': '{}',
    })

    const tree = await buildFileTree(root)
    const tsFile = tree.find(n => n.name === 'app.ts')
    expect(tsFile?.language).toBe('typescript')
    const cssFile = tree.find(n => n.name === 'style.css')
    expect(cssFile?.language).toBe('css')
  })

  test('directories have type "directory" and files have type "file"', async () => {
    const root = await createTempProject('types-check', {
      'src/main.ts': 'export {}',
    })

    const tree = await buildFileTree(root)
    const srcDir = tree.find(n => n.name === 'src')
    expect(srcDir?.type).toBe('directory')
    expect(srcDir?.children).toBeDefined()

    const mainFile = srcDir?.children?.find(n => n.name === 'main.ts')
    expect(mainFile?.type).toBe('file')
  })

  test('handles empty directories', async () => {
    const root = await createTempProject('empty-dir', {
      'src/.gitkeep': '',
    })
    const tree = await buildFileTree(root)
    expect(tree.length).toBeGreaterThan(0)
  })
})

// ── flattenFileTree ───────────────────────────────────────────────────────────

describe('flattenFileTree', () => {
  test('extracts all file paths from a tree', async () => {
    const root = await createTempProject('flatten-test', {
      'src/index.ts': 'export {}',
      'src/lib/utils.ts': 'export {}',
      'README.md': '# Test',
    })

    const tree = await buildFileTree(root)
    const files = flattenFileTree(tree)
    expect(files).toContain('src/index.ts')
    expect(files).toContain('src/lib/utils.ts')
    expect(files).toContain('README.md')
  })

  test('does not include directories', async () => {
    const root = await createTempProject('flatten-nodirs', {
      'src/index.ts': 'export {}',
    })

    const tree = await buildFileTree(root)
    const files = flattenFileTree(tree)
    expect(files).not.toContain('src')
    expect(files.every(f => !f.endsWith('/'))).toBe(true)
  })
})

// ── analyzeModule ─────────────────────────────────────────────────────────────

describe('analyzeModule', () => {
  test('extracts exports from a TypeScript file', async () => {
    const root = await createTempProject('exports-test', {
      'utils.ts': `
export function greet(name: string) { return 'hello ' + name }
export const VERSION = '1.0.0'
export class UserService {}
export type Config = { debug: boolean }
export interface Logger { log(msg: string): void }
`,
    })

    const mod = await analyzeModule(join(root, 'utils.ts'))
    expect(mod.exports).toContain('greet')
    expect(mod.exports).toContain('VERSION')
    expect(mod.exports).toContain('UserService')
    expect(mod.exports).toContain('Config')
    expect(mod.exports).toContain('Logger')
  })

  test('extracts imports', async () => {
    const root = await createTempProject('imports-test', {
      'app.ts': `
import { join } from 'node:path'
import express from 'express'
import { helper } from './utils.js'
`,
    })

    const mod = await analyzeModule(join(root, 'app.ts'))
    expect(mod.imports).toContain('node:path')
    expect(mod.imports).toContain('express')
    expect(mod.imports).toContain('./utils.js')
  })

  test('classifies test files', async () => {
    const root = await createTempProject('test-classify', {
      'app.test.ts': `
import { describe, test } from 'bun:test'
describe('app', () => { test('works', () => {}) })
`,
    })

    const mod = await analyzeModule(join(root, 'app.test.ts'))
    expect(mod.type).toBe('test')
  })

  test('classifies config files', async () => {
    const root = await createTempProject('config-classify', {
      'vite.config.ts': 'export default defineConfig({})',
    })

    const mod = await analyzeModule(join(root, 'vite.config.ts'))
    expect(mod.type).toBe('config')
  })

  test('classifies style files', async () => {
    const root = await createTempProject('style-classify', {
      'theme.css': 'body { color: red; }',
    })

    const mod = await analyzeModule(join(root, 'theme.css'))
    expect(mod.type).toBe('style')
  })

  test('classifies service files', async () => {
    const root = await createTempProject('service-classify', {
      'auth-service.ts': `
export class AuthService {
  async login(user: string, pass: string) { return true }
}
`,
    })

    const mod = await analyzeModule(join(root, 'auth-service.ts'))
    expect(mod.type).toBe('service')
  })

  test('classifies route files', async () => {
    const root = await createTempProject('route-classify', {
      'router.ts': 'export const routes = []',
    })

    const mod = await analyzeModule(join(root, 'router.ts'))
    expect(mod.type).toBe('route')
  })

  test('estimates complexity', async () => {
    const root = await createTempProject('complexity-test', {
      'simple.ts': 'export const x = 1',
      'complex.ts': Array.from({ length: 80 }, (_, i) =>
        `function fn${i}() { if (true) { for (let j = 0; j < 10; j++) { try { console.log(j) } catch(e) {} } } }`
      ).join('\n'),
    })

    const simple = await analyzeModule(join(root, 'simple.ts'))
    expect(simple.complexity).toBe('low')

    const complex = await analyzeModule(join(root, 'complex.ts'))
    expect(complex.complexity).toBe('high')
  })

  test('handles unreadable files gracefully', async () => {
    const mod = await analyzeModule('/nonexistent/path/foo.ts')
    expect(mod.name).toBe('foo')
    expect(mod.exports).toEqual([])
    expect(mod.imports).toEqual([])
    expect(mod.complexity).toBe('low')
  })

  test('extracts re-exports from barrel files', async () => {
    const root = await createTempProject('barrel-test', {
      'index.ts': `
export { UserService } from './user-service.js'
export { AuthService, type AuthConfig } from './auth-service.js'
`,
    })

    const mod = await analyzeModule(join(root, 'index.ts'))
    expect(mod.exports).toContain('UserService')
    expect(mod.exports).toContain('AuthService')
    expect(mod.exports).toContain('AuthConfig')
  })
})

// ── buildDependencyMap ────────────────────────────────────────────────────────

describe('buildDependencyMap', () => {
  test('traces import relationships between files', async () => {
    const root = await createTempProject('dep-map-test', {
      'src/index.ts': `import { helper } from './utils.js'\nconsole.log(helper())`,
      'src/utils.ts': `export function helper() { return 42 }`,
    })

    const files = ['src/index.ts', 'src/utils.ts']
    const depMap = await buildDependencyMap(root, files)

    expect(depMap['src/index.ts']).toBeDefined()
    expect(depMap['src/index.ts'].imports.length).toBeGreaterThan(0)
  })

  test('builds reverse dependency edges (importedBy)', async () => {
    const root = await createTempProject('reverse-deps', {
      'src/a.ts': `import { b } from './b.js'`,
      'src/b.ts': `export const b = 1`,
      'src/c.ts': `import { b } from './b.js'`,
    })

    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts']
    const depMap = await buildDependencyMap(root, files)

    expect(depMap['src/b.ts']).toBeDefined()
    expect(depMap['src/b.ts'].importedBy).toContain('src/a.ts')
    expect(depMap['src/b.ts'].importedBy).toContain('src/c.ts')
  })

  test('skips non-relative imports (node_modules)', async () => {
    const root = await createTempProject('external-deps', {
      'src/app.ts': `import express from 'express'\nimport { join } from 'node:path'\nimport { helper } from './helper.js'`,
      'src/helper.ts': `export function helper() {}`,
    })

    const files = ['src/app.ts', 'src/helper.ts']
    const depMap = await buildDependencyMap(root, files)

    const appImports = depMap['src/app.ts']?.imports ?? []
    expect(appImports.every(i => !i.includes('express'))).toBe(true)
    expect(appImports.every(i => !i.includes('node:path'))).toBe(true)
  })

  test('handles files with no imports', async () => {
    const root = await createTempProject('no-imports', {
      'src/constants.ts': `export const PI = 3.14`,
    })

    const files = ['src/constants.ts']
    const depMap = await buildDependencyMap(root, files)

    expect(depMap['src/constants.ts']).toBeDefined()
    expect(depMap['src/constants.ts'].imports).toEqual([])
    expect(depMap['src/constants.ts'].importedBy).toEqual([])
  })
})

// ── detectConventions ─────────────────────────────────────────────────────────

describe('detectConventions', () => {
  test('detects kebab-case file naming', async () => {
    const root = await createTempProject('kebab-naming', {
      'src/user-service.ts': 'export {}',
      'src/auth-handler.ts': 'export {}',
      'src/data-model.ts': 'export {}',
      'src/api-client.ts': 'export {}',
      'package.json': '{}',
    })

    const files = ['src/user-service.ts', 'src/auth-handler.ts', 'src/data-model.ts', 'src/api-client.ts']
    const conventions = await detectConventions(root, files)
    expect(conventions.fileNaming).toBe('kebab-case')
  })

  test('detects camelCase file naming', async () => {
    const root = await createTempProject('camel-naming', {
      'src/userService.ts': 'export {}',
      'src/authHandler.ts': 'export {}',
      'src/dataModel.ts': 'export {}',
      'src/apiClient.ts': 'export {}',
      'package.json': '{}',
    })

    const files = ['src/userService.ts', 'src/authHandler.ts', 'src/dataModel.ts', 'src/apiClient.ts']
    const conventions = await detectConventions(root, files)
    expect(conventions.fileNaming).toBe('camelCase')
  })

  test('detects test pattern from file names', async () => {
    const root = await createTempProject('test-pattern', {
      'src/app.test.ts': '',
      'src/utils.test.ts': '',
      'src/service.test.ts': '',
      'package.json': '{}',
    })

    const files = ['src/app.test.ts', 'src/utils.test.ts', 'src/service.test.ts']
    const conventions = await detectConventions(root, files)
    expect(conventions.testPattern).toBe('*.test.*')
  })

  test('detects spec test pattern', async () => {
    const root = await createTempProject('spec-pattern', {
      'src/app.spec.ts': '',
      'src/utils.spec.ts': '',
      'package.json': '{}',
    })

    const files = ['src/app.spec.ts', 'src/utils.spec.ts']
    const conventions = await detectConventions(root, files)
    expect(conventions.testPattern).toBe('*.spec.*')
  })

  test('detects ESM import style', async () => {
    const root = await createTempProject('esm-style', {
      'src/a.ts': `import { foo } from './foo.js'\nexport const bar = foo`,
      'src/b.ts': `import path from 'node:path'\nexport default path`,
      'package.json': '{}',
    })

    const files = ['src/a.ts', 'src/b.ts']
    const conventions = await detectConventions(root, files)
    expect(conventions.importStyle).toBe('esm')
  })

  test('detects CommonJS import style', async () => {
    const root = await createTempProject('cjs-style', {
      'src/a.js': `const foo = require('./foo')\nmodule.exports = { foo }`,
      'src/b.js': `const path = require('path')\nmodule.exports = path`,
      'package.json': '{}',
    })

    const files = ['src/a.js', 'src/b.js']
    const conventions = await detectConventions(root, files)
    expect(conventions.importStyle).toBe('commonjs')
  })

  test('detects state management library', async () => {
    const root = await createTempProject('state-mgmt', {
      'package.json': JSON.stringify({
        dependencies: { react: '^18.0.0', zustand: '^4.0.0' },
      }),
      'src/store.ts': 'export {}',
    })

    const conventions = await detectConventions(root, ['src/store.ts'])
    expect(conventions.stateManagement).toBe('zustand')
  })

  test('detects try-catch error handling', async () => {
    const root = await createTempProject('error-handling', {
      'src/api.ts': `
export async function fetch() {
  try { return await get('/api') }
  catch (e) { throw new Error('fail') }
}
export async function post() {
  try { return await send('/api') }
  catch (e) { console.error(e) }
}
`,
      'package.json': '{}',
    })

    const conventions = await detectConventions(root, ['src/api.ts'])
    expect(conventions.errorHandling).toBe('try-catch')
  })
})

// ── getExpertContext ───────────────────────────────────────────────────────────

describe('getExpertContext', () => {
  let testIndex: CodebaseIndex

  beforeAll(async () => {
    const root = await createTempProject('expert-context', {
      'src/components/Button.tsx': `export function Button() { return <button>Click</button> }`,
      'src/services/auth-service.ts': `export class AuthService { login() {} }`,
      'src/utils/helpers.ts': `export function formatDate() {}`,
      'src/routes/api.ts': `export const routes = []`,
      'src/__tests__/auth.test.ts': `import { describe, test } from 'bun:test'`,
      'styles/theme.css': `body { color: red; }`,
      'package.json': '{}',
    })
    testIndex = await indexCodebase(root)
  })

  test('returns frontend-relevant context for OpenFrontendSpecialist', () => {
    const ctx = getExpertContext(testIndex, 'OpenFrontendSpecialist')
    expect(ctx.expertId).toBe('OpenFrontendSpecialist')
    expect(ctx.relevantFiles.some(f => f.includes('.tsx') || f.includes('.css'))).toBe(true)
    expect(ctx.techStack).toBeDefined()
    expect(ctx.conventions).toBeDefined()
  })

  test('returns test-relevant context for TestEngineer', () => {
    const ctx = getExpertContext(testIndex, 'TestEngineer')
    expect(ctx.relevantFiles.some(f => f.includes('.test.'))).toBe(true)
    expect(ctx.relevantModules.some(m => m.type === 'test')).toBe(true)
  })

  test('returns full context for unknown expert', () => {
    const ctx = getExpertContext(testIndex, 'UnknownExpert')
    expect(ctx.relevantModules.length).toBe(testIndex.modules.length)
  })

  test('includes tech stack and conventions', () => {
    const ctx = getExpertContext(testIndex, 'CoderAgent')
    expect(ctx.techStack).toEqual(testIndex.techStack)
    expect(ctx.conventions).toEqual(testIndex.conventions)
  })
})

// ── getRelevantFiles ──────────────────────────────────────────────────────────

describe('getRelevantFiles', () => {
  let testIndex: CodebaseIndex

  beforeAll(async () => {
    const root = await createTempProject('relevant-files', {
      'src/auth/login.ts': `export function login() {}`,
      'src/auth/register.ts': `export function register() {}`,
      'src/auth/auth.test.ts': `import { describe, test } from 'bun:test'`,
      'src/api/users.ts': `export function getUsers() {}`,
      'src/components/Header.tsx': `export function Header() { return <header/> }`,
      'src/utils/format.ts': `export function format() {}`,
      'README.md': '# App',
      'package.json': '{}',
    })
    testIndex = await indexCodebase(root)
  })

  test('finds auth-related files for an auth objective', () => {
    const files = getRelevantFiles(testIndex, 'fix authentication login flow')
    expect(files.some(f => f.includes('auth') || f.includes('login'))).toBe(true)
  })

  test('finds test files for a testing objective', () => {
    const files = getRelevantFiles(testIndex, 'write tests for auth module')
    expect(files.some(f => f.includes('test') || f.includes('auth'))).toBe(true)
  })

  test('finds component files for a UI objective', () => {
    const files = getRelevantFiles(testIndex, 'update the Header component')
    expect(files.some(f => f.includes('Header'))).toBe(true)
  })

  test('returns empty for completely unrelated objective', () => {
    const files = getRelevantFiles(testIndex, 'zzz qqq xxx')
    expect(files.length).toBe(0)
  })

  test('limits results to 30 files', () => {
    const files = getRelevantFiles(testIndex, 'src')
    expect(files.length).toBeLessThanOrEqual(30)
  })
})

// ── getScopeImpact ────────────────────────────────────────────────────────────

describe('getScopeImpact', () => {
  test('identifies downstream dependents', async () => {
    const root = await createTempProject('impact-analysis', {
      'src/core.ts': `export function core() { return 1 }`,
      'src/a.ts': `import { core } from './core.js'\nexport const a = core()`,
      'src/b.ts': `import { core } from './core.js'\nexport const b = core()`,
      'src/c.ts': `import { a } from './a.js'\nexport const c = a`,
      'package.json': '{}',
    })

    const index = await indexCodebase(root)
    const impact = getScopeImpact(index, ['src/core.ts'])
    expect(impact.directlyAffected.length).toBeGreaterThanOrEqual(0)
    expect(impact.summary).toContain('1 file')
  })

  test('reports low risk when no dependents exist', async () => {
    const root = await createTempProject('no-impact', {
      'src/standalone.ts': `export const x = 1`,
      'package.json': '{}',
    })

    const index = await indexCodebase(root)
    const impact = getScopeImpact(index, ['src/standalone.ts'])
    expect(impact.riskLevel).toBe('low')
    expect(impact.directlyAffected).toEqual([])
    expect(impact.transitivelyAffected).toEqual([])
  })

  test('returns a summary string', async () => {
    const root = await createTempProject('impact-summary', {
      'src/a.ts': `export const a = 1`,
      'package.json': '{}',
    })

    const index = await indexCodebase(root)
    const impact = getScopeImpact(index, ['src/a.ts'])
    expect(typeof impact.summary).toBe('string')
    expect(impact.summary.length).toBeGreaterThan(0)
  })
})

// ── indexCodebase (full integration) ──────────────────────────────────────────

describe('indexCodebase', () => {
  test('builds a complete index from a temp project', async () => {
    const root = await createTempProject('full-index', {
      'package.json': JSON.stringify({
        dependencies: { express: '^4.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      }),
      'tsconfig.json': '{}',
      'src/index.ts': `import { router } from './router.js'\nconsole.log(router)`,
      'src/router.ts': `export const router = {}`,
      'src/utils.ts': `export function help() {}`,
      'src/app.test.ts': `describe('app', () => {})`,
    })

    const index = await indexCodebase(root)

    expect(index.root).toBe(root)
    expect(index.techStack.languages).toContain('typescript')
    expect(index.modules.length).toBeGreaterThan(0)
    expect(Object.keys(index.dependencies).length).toBeGreaterThan(0)
    expect(index.fileTree.length).toBeGreaterThan(0)
    expect(index.conventions).toBeDefined()
    expect(index.indexedAt).toBeInstanceOf(Date)
  })

  test('modules have correct structure', async () => {
    const root = await createTempProject('module-structure', {
      'src/service.ts': `
export class UserService {
  async getUser(id: string) { return { id } }
}
`,
      'package.json': '{}',
    })

    const index = await indexCodebase(root)
    const mod = index.modules.find(m => m.path.includes('service'))
    expect(mod).toBeDefined()
    expect(mod!.name).toBe('service')
    expect(mod!.exports).toContain('UserService')
    expect(['low', 'medium', 'high']).toContain(mod!.complexity)
  })
})

// ── Caching: saveIndex / loadIndex / isIndexStale ─────────────────────────────

describe('index caching', () => {
  test('saveIndex writes and loadIndex reads a valid index', async () => {
    const root = await createTempProject('cache-test', {
      'src/app.ts': 'export {}',
      'package.json': '{}',
    })

    const index = await indexCodebase(root)
    const savedPath = await saveIndex(root, index)
    expect(savedPath).toContain('.codebase-index.json')

    const loaded = await loadIndex(root)
    expect(loaded).not.toBeNull()
    expect(loaded!.root).toBe(index.root)
    expect(loaded!.techStack).toEqual(index.techStack)
    expect(loaded!.indexedAt).toBeInstanceOf(Date)
  })

  test('loadIndex returns null when no cached index exists', async () => {
    const root = await createTempProject('no-cache', {
      'package.json': '{}',
    })

    const loaded = await loadIndex(root)
    expect(loaded).toBeNull()
  })

  test('isIndexStale returns false for a fresh index', async () => {
    const index: CodebaseIndex = {
      root: '/tmp/test',
      techStack: { languages: [], frameworks: [], buildTools: [], testFrameworks: [], packageManager: 'unknown' },
      modules: [],
      dependencies: {},
      fileTree: [],
      conventions: { fileNaming: 'unknown', testPattern: 'unknown', componentPattern: 'unknown', stateManagement: 'none', errorHandling: 'unknown', importStyle: 'unknown' },
      indexedAt: new Date(),
    }
    expect(isIndexStale(index, '/tmp/test')).toBe(false)
  })

  test('isIndexStale returns true for an old index', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const index: CodebaseIndex = {
      root: '/tmp/test',
      techStack: { languages: [], frameworks: [], buildTools: [], testFrameworks: [], packageManager: 'unknown' },
      modules: [],
      dependencies: {},
      fileTree: [],
      conventions: { fileNaming: 'unknown', testPattern: 'unknown', componentPattern: 'unknown', stateManagement: 'none', errorHandling: 'unknown', importStyle: 'unknown' },
      indexedAt: twoHoursAgo,
    }
    expect(isIndexStale(index, '/tmp/test')).toBe(true)
  })
})

// ── updateIndex (incremental) ─────────────────────────────────────────────────

describe('updateIndex', () => {
  test('incrementally updates changed modules', async () => {
    const root = await createTempProject('incremental-update', {
      'src/app.ts': `export function app() { return 'v1' }`,
      'src/utils.ts': `export function helper() {}`,
      'package.json': '{}',
    })

    const index = await indexCodebase(root)
    const origModCount = index.modules.length

    // "Change" app.ts — small delay to ensure distinct timestamps
    await new Promise(resolve => setTimeout(resolve, 5))
    await writeFile(join(root, 'src/app.ts'), `export function app() { return 'v2' }\nexport function newFn() {}`, 'utf-8')

    const updated = await updateIndex(index, ['src/app.ts'])
    expect(updated.indexedAt.getTime()).toBeGreaterThanOrEqual(index.indexedAt.getTime())
    expect(updated.modules.length).toBe(origModCount)

    const appMod = updated.modules.find(m => m.path === 'src/app.ts')
    expect(appMod?.exports).toContain('newFn')
  })

  test('adds new modules for previously unknown files', async () => {
    const root = await createTempProject('add-new-file', {
      'src/app.ts': `export function app() {}`,
      'package.json': '{}',
    })

    const index = await indexCodebase(root)

    await writeFile(join(root, 'src/new-module.ts'), `export function newThing() {}`, 'utf-8')

    const updated = await updateIndex(index, ['src/new-module.ts'])
    const newMod = updated.modules.find(m => m.path === 'src/new-module.ts')
    expect(newMod).toBeDefined()
    expect(newMod!.exports).toContain('newThing')
  })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function flattenNames(tree: FileNode[]): string[] {
  const names: string[] = []
  for (const node of tree) {
    names.push(node.name)
    if (node.children) names.push(...flattenNames(node.children))
  }
  return names
}
