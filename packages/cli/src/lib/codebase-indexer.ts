/**
 * Codebase Indexer — deep contextual awareness engine for expert agents.
 *
 * Builds a comprehensive index of the project structure, tech stack,
 * module relationships, dependency graph, and coding conventions.
 * Experts use this index to understand *what* they're working on,
 * not just match keywords.
 *
 * Features:
 * - Full async filesystem scanning with smart ignore patterns
 * - Tech stack detection from package manifests & file extensions
 * - Module classification (component, service, util, config, test, etc.)
 * - Import/export dependency graph
 * - Convention inference (naming, test patterns, import style)
 * - Expert-specific context slicing
 * - Objective-based relevant file finding
 * - Impact analysis for change sets
 * - JSON-based caching with staleness detection & incremental updates
 */

import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises'
import { join, relative, extname, basename, dirname } from 'node:path'
import { createLogger } from './logger.js'

const log = createLogger('codebase-indexer')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TechStack {
  languages: string[]
  frameworks: string[]
  buildTools: string[]
  testFrameworks: string[]
  packageManager: string
}

export type ModuleType =
  | 'component'
  | 'service'
  | 'util'
  | 'config'
  | 'test'
  | 'style'
  | 'route'
  | 'model'
  | 'controller'

export interface ModuleInfo {
  path: string
  name: string
  type: ModuleType
  exports: string[]
  imports: string[]
  complexity: 'low' | 'medium' | 'high'
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  language?: string
}

export interface ProjectConventions {
  fileNaming: string
  testPattern: string
  componentPattern: string
  stateManagement: string
  errorHandling: string
  importStyle: string
}

export interface DependencyMap {
  [filePath: string]: { imports: string[]; importedBy: string[] }
}

export interface CodebaseIndex {
  root: string
  techStack: TechStack
  modules: ModuleInfo[]
  dependencies: DependencyMap
  fileTree: FileNode[]
  conventions: ProjectConventions
  indexedAt: Date
}

export interface ExpertContext {
  expertId: string
  relevantModules: ModuleInfo[]
  relevantFiles: string[]
  relatedDependencies: DependencyMap
  techStack: TechStack
  conventions: ProjectConventions
}

export interface ImpactAnalysis {
  directlyAffected: string[]
  transitivelyAffected: string[]
  riskLevel: 'low' | 'medium' | 'high'
  summary: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  'vendor',
  '.oac',
  '.opencode',
  '__pycache__',
  '.DS_Store',
  'target',
]

const INDEX_PATH = '.opencode/.codebase-index.json'

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.rb': 'ruby',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.md': 'markdown',
  '.sql': 'sql',
  '.sh': 'shell',
  '.proto': 'protobuf',
  '.graphql': 'graphql',
}

const EXPERT_FILE_INTERESTS: Record<string, { patterns: RegExp[]; moduleTypes: ModuleType[] }> = {
  CoderAgent: {
    patterns: [/\.(ts|js|go|rs|py|java|rb|c|cpp)$/i],
    moduleTypes: ['service', 'util', 'model', 'controller'],
  },
  OpenFrontendSpecialist: {
    patterns: [/\.(tsx|jsx|css|scss|html|vue|svelte)$/i, /components?\//i, /pages?\//i],
    moduleTypes: ['component', 'style', 'route'],
  },
  BackendDeveloperAgent: {
    patterns: [/\.(go|rs|py|java|rb)$/i, /(api|server|backend|routes|controllers|services)\//i],
    moduleTypes: ['service', 'controller', 'route', 'model'],
  },
  TestEngineer: {
    patterns: [/\.(test|spec)\./i, /(__tests__|test|tests)\//i],
    moduleTypes: ['test'],
  },
  SecurityAgent: {
    patterns: [/auth/i, /security/i, /crypto/i, /middleware/i, /permission/i],
    moduleTypes: ['service', 'util', 'config'],
  },
  OpenDevopsSpecialist: {
    patterns: [/Dockerfile/i, /docker-compose/i, /\.github\//i, /\.ya?ml$/i, /\.tf$/i],
    moduleTypes: ['config'],
  },
  DocWriter: {
    patterns: [/\.mdx?$/i, /docs?\//i, /README/i],
    moduleTypes: ['config'],
  },
  SystemArchitectAgent: {
    patterns: [/\.proto$/i, /\.graphql$/i, /openapi/i, /schema/i, /architecture/i],
    moduleTypes: ['model', 'config'],
  },
  DebugAgent: {
    patterns: [/\.(ts|js|go|rs|py|java|rb|c|cpp)$/i],
    moduleTypes: ['service', 'util', 'controller', 'model'],
  },
}

// ── File tree building ────────────────────────────────────────────────────────

export async function buildFileTree(
  projectRoot: string,
  options?: { ignore?: string[] },
): Promise<FileNode[]> {
  const ignoreSet = new Set(options?.ignore ?? DEFAULT_IGNORE)

  async function walk(absDir: string, relDir: string): Promise<FileNode[]> {
    let entries
    try {
      entries = await readdir(absDir, { withFileTypes: true })
    } catch {
      return []
    }

    const nodes: FileNode[] = []

    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

    for (const entry of sorted) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name

      if (ignoreSet.has(entry.name)) continue

      if (entry.isDirectory()) {
        const children = await walk(join(absDir, entry.name), relPath)
        nodes.push({ name: entry.name, path: relPath, type: 'directory', children })
      } else if (entry.isFile()) {
        const ext = extname(entry.name)
        const language = LANGUAGE_MAP[ext]
        nodes.push({ name: entry.name, path: relPath, type: 'file', ...(language ? { language } : {}) })
      }
    }

    return nodes
  }

  return walk(projectRoot, '')
}

// ── Flat file list extraction from tree ───────────────────────────────────────

export function flattenFileTree(tree: FileNode[]): string[] {
  const files: string[] = []
  function collect(nodes: FileNode[]) {
    for (const node of nodes) {
      if (node.type === 'file') files.push(node.path)
      if (node.children) collect(node.children)
    }
  }
  collect(tree)
  return files
}

// ── Tech stack detection ──────────────────────────────────────────────────────

export async function detectTechStack(projectRoot: string): Promise<TechStack> {
  const stack: TechStack = {
    languages: [],
    frameworks: [],
    buildTools: [],
    testFrameworks: [],
    packageManager: 'unknown',
  }

  const languages = new Set<string>()
  const frameworks = new Set<string>()
  const buildTools = new Set<string>()
  const testFrameworks = new Set<string>()

  // Detect package manager
  const pmChecks: Array<[string, string]> = [
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
    ['Pipfile.lock', 'pip'],
    ['poetry.lock', 'poetry'],
    ['go.sum', 'go'],
    ['Cargo.lock', 'cargo'],
    ['Gemfile.lock', 'bundler'],
  ]

  for (const [file, pm] of pmChecks) {
    if (await fileExists(join(projectRoot, file))) {
      stack.packageManager = pm
      break
    }
  }

  // Fallback: detect PM from manifest files when no lock file exists
  if (stack.packageManager === 'unknown') {
    if (await fileExists(join(projectRoot, 'go.mod'))) stack.packageManager = 'go'
    else if (await fileExists(join(projectRoot, 'Cargo.toml'))) stack.packageManager = 'cargo'
    else if (await fileExists(join(projectRoot, 'Gemfile'))) stack.packageManager = 'bundler'
    else if (await fileExists(join(projectRoot, 'pyproject.toml'))) stack.packageManager = 'poetry'
    else if (await fileExists(join(projectRoot, 'package.json'))) stack.packageManager = 'npm'
  }

  // Parse package.json for JS/TS ecosystems
  const pkgPath = join(projectRoot, 'package.json')
  if (await fileExists(pkgPath)) {
    try {
      const raw = await readFile(pkgPath, 'utf-8')
      const pkg = JSON.parse(raw) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }

      languages.add('javascript')
      if (allDeps['typescript']) languages.add('typescript')

      const frameworkMap: Record<string, string> = {
        react: 'react', next: 'nextjs', vue: 'vue', svelte: 'svelte',
        angular: 'angular', express: 'express', fastify: 'fastify',
        hono: 'hono', elysia: 'elysia', commander: 'commander',
        'solid-js': 'solidjs', astro: 'astro', remix: 'remix',
      }
      const buildToolMap: Record<string, string> = {
        vite: 'vite', webpack: 'webpack', esbuild: 'esbuild',
        rollup: 'rollup', turbo: 'turborepo', tsup: 'tsup',
        'ts-node': 'ts-node', tsx: 'tsx',
      }
      const testMap: Record<string, string> = {
        vitest: 'vitest', jest: 'jest', mocha: 'mocha',
        cypress: 'cypress', playwright: 'playwright',
        '@testing-library/react': 'testing-library',
      }

      for (const dep of Object.keys(allDeps)) {
        if (frameworkMap[dep]) frameworks.add(frameworkMap[dep])
        if (buildToolMap[dep]) buildTools.add(buildToolMap[dep])
        if (testMap[dep]) testFrameworks.add(testMap[dep])
      }
    } catch {
      log.debug('Failed to parse package.json')
    }
  }

  // Detect from config files
  if (await fileExists(join(projectRoot, 'go.mod'))) languages.add('go')
  if (await fileExists(join(projectRoot, 'Cargo.toml'))) languages.add('rust')
  if (await fileExists(join(projectRoot, 'pyproject.toml')) || await fileExists(join(projectRoot, 'setup.py'))) languages.add('python')
  if (await fileExists(join(projectRoot, 'Gemfile'))) languages.add('ruby')

  if (await fileExists(join(projectRoot, 'tsconfig.json'))) {
    languages.add('typescript')
    buildTools.add('tsc')
  }

  // Check for bun:test (bun runtime itself is the test framework)
  if (stack.packageManager === 'bun' && testFrameworks.size === 0) {
    testFrameworks.add('bun:test')
  }

  stack.languages = [...languages].sort()
  stack.frameworks = [...frameworks].sort()
  stack.buildTools = [...buildTools].sort()
  stack.testFrameworks = [...testFrameworks].sort()

  return stack
}

// ── Module analysis ───────────────────────────────────────────────────────────

export async function analyzeModule(filePath: string): Promise<ModuleInfo> {
  const name = basename(filePath, extname(filePath))
  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    return { path: filePath, name, type: 'util', exports: [], imports: [], complexity: 'low' }
  }

  const exports = extractExports(content)
  const imports = extractImports(content)
  const type = classifyModuleType(filePath, content, exports)
  const complexity = estimateComplexity(content)

  return { path: filePath, name, type, exports, imports, complexity }
}

function extractExports(content: string): string[] {
  const exports: string[] = []
  const patterns = [
    /export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/g,
    /export\s+\{\s*([^}]+)\}/g,
    /module\.exports\s*=\s*\{?\s*(\w+)/g,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      const captured = match[1]
      if (!captured) continue
      if (pattern === patterns[1]) {
        for (const name of captured.split(',')) {
          const trimmed = name.trim().split(/\s+as\s+/)[0]?.trim().replace(/^type\s+/, '')
          if (trimmed) exports.push(trimmed)
        }
      } else {
        exports.push(captured)
      }
    }
  }

  return [...new Set(exports)]
}

function extractImports(content: string): string[] {
  const imports: string[] = []
  const patterns = [
    /(?:import|from)\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) imports.push(match[1])
    }
  }

  return [...new Set(imports)]
}

function classifyModuleType(filePath: string, content: string, exports: string[]): ModuleType {
  const lower = filePath.toLowerCase()
  const base = basename(lower)

  if (/\.(test|spec)\./i.test(base) || /(__tests__|\/test\/|\/tests\/)/i.test(lower)) return 'test'
  if (/\.(css|scss|sass|less|styl)$/i.test(base)) return 'style'
  if (/(config|\.config|rc)\./i.test(base) || /tsconfig|jest\.config|vite\.config|webpack\.config/i.test(base)) return 'config'
  if (/route/i.test(base) || /router/i.test(base)) return 'route'
  if (/model/i.test(base) || /schema/i.test(base) || /entity/i.test(base)) return 'model'
  if (/controller/i.test(base)) return 'controller'

  if (/\.(tsx|jsx)$/i.test(base) || /component/i.test(lower)) {
    const hasJsx = /(?:React\.createElement|<\w+[\s/>]|return\s*\(?\s*<)/s.test(content)
    if (hasJsx) return 'component'
  }

  if (/service/i.test(base) || /provider/i.test(base) || /client/i.test(base)) return 'service'

  if (/(util|helper|lib|common|shared)/i.test(base) || /(utils?|helpers?|lib|common|shared)\//i.test(lower)) return 'util'

  const hasClassExport = exports.some(e => /^[A-Z]/.test(e)) && /class\s+\w+/i.test(content)
  if (hasClassExport && /(service|manager|handler|processor)/i.test(content)) return 'service'

  return 'util'
}

function estimateComplexity(content: string): 'low' | 'medium' | 'high' {
  const lines = content.split('\n').length
  const branches = (content.match(/\b(if|else|switch|case|catch|while|for)\b/g) ?? []).length
  const functions = (content.match(/\b(function|=>|async)\b/g) ?? []).length

  const score = lines / 50 + branches / 5 + functions / 3

  if (score > 10) return 'high'
  if (score > 4) return 'medium'
  return 'low'
}

// ── Dependency map ────────────────────────────────────────────────────────────

export async function buildDependencyMap(
  projectRoot: string,
  files: string[],
): Promise<DependencyMap> {
  const depMap: DependencyMap = {}
  const moduleImports = new Map<string, string[]>()

  for (const file of files) {
    if (!isSourceFile(file)) continue

    const absPath = join(projectRoot, file)
    let content: string
    try {
      content = await readFile(absPath, 'utf-8')
    } catch {
      continue
    }

    const rawImports = extractImports(content)
    const resolvedImports = rawImports
      .filter(imp => imp.startsWith('.') || imp.startsWith('/'))
      .map(imp => resolveRelativeImport(file, imp))

    moduleImports.set(file, resolvedImports)
    if (!depMap[file]) depMap[file] = { imports: [], importedBy: [] }
    depMap[file].imports = resolvedImports
  }

  // Build reverse dependency edges
  for (const [file, imports] of moduleImports) {
    for (const imp of imports) {
      const resolved = findMatchingFile(files, imp)
      if (resolved) {
        if (!depMap[resolved]) depMap[resolved] = { imports: [], importedBy: [] }
        if (!depMap[resolved].importedBy.includes(file)) {
          depMap[resolved].importedBy.push(file)
        }
      }
    }
  }

  return depMap
}

function resolveRelativeImport(fromFile: string, importPath: string): string {
  const dir = dirname(fromFile)
  const resolved = join(dir, importPath).replace(/\\/g, '/')
  return resolved.replace(/^\.\//, '')
}

function findMatchingFile(files: string[], importPath: string): string | undefined {
  const normalized = importPath.replace(/\\/g, '/')

  // Strip .js/.jsx extension for TS→JS resolution (e.g. './foo.js' → './foo.ts')
  const withoutJsExt = normalized.replace(/\.(js|jsx)$/, '')

  const candidates = [
    normalized,
    `${normalized}.ts`,
    `${normalized}.tsx`,
    `${normalized}.js`,
    `${normalized}.jsx`,
    `${normalized}/index.ts`,
    `${normalized}/index.tsx`,
    `${normalized}/index.js`,
  ]

  if (withoutJsExt !== normalized) {
    candidates.push(
      `${withoutJsExt}.ts`,
      `${withoutJsExt}.tsx`,
      `${withoutJsExt}/index.ts`,
      `${withoutJsExt}/index.tsx`,
    )
  }

  for (const candidate of candidates) {
    if (files.includes(candidate)) return candidate
  }
  return undefined
}

function isSourceFile(file: string): boolean {
  return /\.(ts|tsx|js|jsx|go|rs|py|java|rb|c|cpp|h|hpp)$/i.test(file)
}

// ── Convention detection ──────────────────────────────────────────────────────

export async function detectConventions(
  projectRoot: string,
  files: string[],
): Promise<ProjectConventions> {
  const conventions: ProjectConventions = {
    fileNaming: 'unknown',
    testPattern: 'unknown',
    componentPattern: 'unknown',
    stateManagement: 'none',
    errorHandling: 'unknown',
    importStyle: 'unknown',
  }

  // File naming convention
  const sourceFiles = files.filter(isSourceFile).map(f => basename(f, extname(f)))
  if (sourceFiles.length > 0) {
    const kebabCount = sourceFiles.filter(f => /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(f)).length
    const camelCount = sourceFiles.filter(f => /^[a-z][a-zA-Z0-9]*$/.test(f) && /[A-Z]/.test(f)).length
    const pascalCount = sourceFiles.filter(f => /^[A-Z][a-zA-Z0-9]*$/.test(f)).length
    const snakeCount = sourceFiles.filter(f => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(f)).length

    const max = Math.max(kebabCount, camelCount, pascalCount, snakeCount)
    if (max === 0) conventions.fileNaming = 'mixed'
    else if (max === kebabCount) conventions.fileNaming = 'kebab-case'
    else if (max === camelCount) conventions.fileNaming = 'camelCase'
    else if (max === pascalCount) conventions.fileNaming = 'PascalCase'
    else conventions.fileNaming = 'snake_case'
  }

  // Test pattern
  const testFiles = files.filter(f => /\.(test|spec)\./i.test(f))
  if (testFiles.length > 0) {
    const dotTest = testFiles.filter(f => /\.test\./i.test(f)).length
    const dotSpec = testFiles.filter(f => /\.spec\./i.test(f)).length
    conventions.testPattern = dotTest >= dotSpec ? '*.test.*' : '*.spec.*'
  }

  // Component pattern detection
  const componentFiles = files.filter(f => /\.(tsx|jsx|vue|svelte)$/i.test(f))
  if (componentFiles.length > 0) {
    const names = componentFiles.map(f => basename(f, extname(f)))
    const pascalComponents = names.filter(n => /^[A-Z]/.test(n)).length
    const kebabComponents = names.filter(n => /^[a-z].*-/.test(n)).length
    conventions.componentPattern = pascalComponents >= kebabComponents ? 'PascalCase' : 'kebab-case'
  }

  // State management detection
  const pkgPath = join(projectRoot, 'package.json')
  if (await fileExists(pkgPath)) {
    try {
      const raw = await readFile(pkgPath, 'utf-8')
      const pkg = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
      const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }

      if (allDeps['redux'] || allDeps['@reduxjs/toolkit']) conventions.stateManagement = 'redux'
      else if (allDeps['zustand']) conventions.stateManagement = 'zustand'
      else if (allDeps['mobx']) conventions.stateManagement = 'mobx'
      else if (allDeps['jotai']) conventions.stateManagement = 'jotai'
      else if (allDeps['recoil']) conventions.stateManagement = 'recoil'
      else if (allDeps['pinia']) conventions.stateManagement = 'pinia'
      else if (allDeps['vuex']) conventions.stateManagement = 'vuex'
    } catch {
      // skip
    }
  }

  // Import style detection by sampling source files
  let esModuleCount = 0
  let commonjsCount = 0
  const sampleFiles = files.filter(isSourceFile).slice(0, 20)

  for (const file of sampleFiles) {
    try {
      const content = await readFile(join(projectRoot, file), 'utf-8')
      if (/\bimport\s+/.test(content) || /\bexport\s+/.test(content)) esModuleCount++
      if (/\brequire\s*\(/.test(content) || /\bmodule\.exports\b/.test(content)) commonjsCount++
    } catch {
      // skip
    }
  }

  if (esModuleCount > 0 || commonjsCount > 0) {
    conventions.importStyle = esModuleCount >= commonjsCount ? 'esm' : 'commonjs'
  }

  // Error handling pattern detection
  let tryCount = 0
  let resultTypeCount = 0
  for (const file of sampleFiles) {
    try {
      const content = await readFile(join(projectRoot, file), 'utf-8')
      tryCount += (content.match(/\btry\s*\{/g) ?? []).length
      resultTypeCount += (content.match(/Result<|Either<|Ok\(|Err\(/g) ?? []).length
    } catch {
      // skip
    }
  }
  if (tryCount > 0 || resultTypeCount > 0) {
    conventions.errorHandling = resultTypeCount > tryCount ? 'result-type' : 'try-catch'
  }

  return conventions
}

// ── Expert context ────────────────────────────────────────────────────────────

export function getExpertContext(index: CodebaseIndex, expertId: string): ExpertContext {
  const interests = EXPERT_FILE_INTERESTS[expertId]

  let relevantModules: ModuleInfo[]
  let relevantFiles: string[]

  if (interests) {
    relevantModules = index.modules.filter(mod => {
      if (interests.moduleTypes.includes(mod.type)) return true
      return interests.patterns.some(p => p.test(mod.path))
    })
    const allFiles = flattenFileTree(index.fileTree)
    relevantFiles = allFiles.filter(f => interests.patterns.some(p => p.test(f)))
  } else {
    relevantModules = index.modules
    relevantFiles = flattenFileTree(index.fileTree)
  }

  const relatedDeps: DependencyMap = {}
  for (const mod of relevantModules) {
    const relPath = relative(index.root, mod.path).replace(/\\/g, '/')
    if (index.dependencies[relPath]) {
      relatedDeps[relPath] = index.dependencies[relPath]
    }
    if (index.dependencies[mod.path]) {
      relatedDeps[mod.path] = index.dependencies[mod.path]
    }
  }

  return {
    expertId,
    relevantModules,
    relevantFiles,
    relatedDependencies: relatedDeps,
    techStack: index.techStack,
    conventions: index.conventions,
  }
}

// ── Relevant file finding ─────────────────────────────────────────────────────

export function getRelevantFiles(index: CodebaseIndex, objective: string): string[] {
  const lower = objective.toLowerCase()
  const allFiles = flattenFileTree(index.fileTree)

  const scored = allFiles.map(file => {
    let score = 0
    const fileLower = file.toLowerCase()
    const baseName = basename(file, extname(file)).toLowerCase()

    // Direct mention of file or directory name
    const segments = file.split('/')
    for (const seg of segments) {
      if (lower.includes(seg.toLowerCase())) score += 3
    }

    // Keyword matching against common terms
    const keywords = lower.split(/\s+/).filter(w => w.length > 2)
    for (const kw of keywords) {
      if (fileLower.includes(kw)) score += 2
      if (baseName.includes(kw)) score += 1
    }

    // Module-type relevance
    const mod = index.modules.find(m => m.path === file || m.path.endsWith(file))
    if (mod) {
      if (lower.includes('test') && mod.type === 'test') score += 3
      if (lower.includes('api') && (mod.type === 'controller' || mod.type === 'route')) score += 3
      if (lower.includes('component') && mod.type === 'component') score += 3
      if (lower.includes('style') && mod.type === 'style') score += 3
      if (lower.includes('config') && mod.type === 'config') score += 3
    }

    // Dependency-based scoring: files that import/are imported by many others are more central
    const deps = index.dependencies[file]
    if (deps) {
      score += Math.min(deps.importedBy.length, 3)
    }

    return { file, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map(s => s.file)
}

// ── Impact analysis ───────────────────────────────────────────────────────────

export function getScopeImpact(index: CodebaseIndex, files: string[]): ImpactAnalysis {
  const directlyAffected = new Set<string>()
  const visited = new Set<string>()

  // Find direct dependents
  for (const file of files) {
    const deps = index.dependencies[file]
    if (deps) {
      for (const dep of deps.importedBy) {
        if (!files.includes(dep)) directlyAffected.add(dep)
      }
    }
  }

  // Find transitive dependents (breadth-first)
  const transitivelyAffected = new Set<string>()
  const queue = [...directlyAffected]
  for (const file of files) {
    visited.add(file)
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)

    const deps = index.dependencies[current]
    if (deps) {
      for (const dep of deps.importedBy) {
        if (!visited.has(dep) && !files.includes(dep) && !directlyAffected.has(dep)) {
          transitivelyAffected.add(dep)
          queue.push(dep)
        }
      }
    }
  }

  const totalAffected = directlyAffected.size + transitivelyAffected.size
  let riskLevel: 'low' | 'medium' | 'high' = 'low'
  if (totalAffected > 10) riskLevel = 'high'
  else if (totalAffected > 3) riskLevel = 'medium'

  const summary = totalAffected === 0
    ? `Changes to ${files.length} file(s) have no detected downstream dependencies.`
    : `Changes to ${files.length} file(s) affect ${directlyAffected.size} direct and ${transitivelyAffected.size} transitive dependents.`

  return {
    directlyAffected: [...directlyAffected],
    transitivelyAffected: [...transitivelyAffected],
    riskLevel,
    summary,
  }
}

// ── Full index ────────────────────────────────────────────────────────────────

export async function indexCodebase(projectRoot: string): Promise<CodebaseIndex> {
  log.debug('Indexing codebase', { projectRoot })

  const [techStack, fileTree] = await Promise.all([
    detectTechStack(projectRoot),
    buildFileTree(projectRoot),
  ])

  const allFiles = flattenFileTree(fileTree)
  const sourceFiles = allFiles.filter(isSourceFile)

  log.debug('File scan complete', { totalFiles: allFiles.length, sourceFiles: sourceFiles.length })

  const modulePromises = sourceFiles.slice(0, 500).map(file =>
    analyzeModule(join(projectRoot, file)).then(mod => ({
      ...mod,
      path: file,
    }))
  )
  const modules = await Promise.all(modulePromises)

  const [dependencies, conventions] = await Promise.all([
    buildDependencyMap(projectRoot, allFiles),
    detectConventions(projectRoot, allFiles),
  ])

  const index: CodebaseIndex = {
    root: projectRoot,
    techStack,
    modules,
    dependencies,
    fileTree,
    conventions,
    indexedAt: new Date(),
  }

  log.debug('Index built', {
    modules: modules.length,
    dependencies: Object.keys(dependencies).length,
    languages: techStack.languages.length,
  })

  return index
}

// ── Caching ───────────────────────────────────────────────────────────────────

export async function saveIndex(projectRoot: string, index: CodebaseIndex): Promise<string> {
  const indexPath = join(projectRoot, INDEX_PATH)
  await mkdir(dirname(indexPath), { recursive: true })

  const serializable = {
    ...index,
    indexedAt: index.indexedAt.toISOString(),
  }
  await writeFile(indexPath, JSON.stringify(serializable, null, 2), 'utf-8')

  return indexPath
}

export async function loadIndex(projectRoot: string): Promise<CodebaseIndex | null> {
  const indexPath = join(projectRoot, INDEX_PATH)
  try {
    const raw = await readFile(indexPath, 'utf-8')
    const parsed = JSON.parse(raw) as CodebaseIndex & { indexedAt: string }
    return { ...parsed, indexedAt: new Date(parsed.indexedAt) }
  } catch {
    return null
  }
}

export function isIndexStale(index: CodebaseIndex, _projectRoot: string): boolean {
  const ageMs = Date.now() - index.indexedAt.getTime()
  const ONE_HOUR = 60 * 60 * 1000
  return ageMs > ONE_HOUR
}

export async function updateIndex(
  existingIndex: CodebaseIndex,
  changedFiles: string[],
): Promise<CodebaseIndex> {
  const projectRoot = existingIndex.root

  // Re-analyze only the changed modules
  const updatedModules = [...existingIndex.modules]
  for (const file of changedFiles) {
    const absPath = join(projectRoot, file)
    if (!isSourceFile(file)) continue

    const newMod = await analyzeModule(absPath)
    const modWithRelPath = { ...newMod, path: file }

    const existingIdx = updatedModules.findIndex(m => m.path === file)
    if (existingIdx >= 0) {
      updatedModules[existingIdx] = modWithRelPath
    } else {
      updatedModules.push(modWithRelPath)
    }
  }

  // Rebuild the file tree and dependency map to pick up any new/removed files
  const fileTree = await buildFileTree(projectRoot)
  const allFiles = flattenFileTree(fileTree)
  const dependencies = await buildDependencyMap(projectRoot, allFiles)

  return {
    ...existingIndex,
    modules: updatedModules,
    fileTree,
    dependencies,
    indexedAt: new Date(),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
