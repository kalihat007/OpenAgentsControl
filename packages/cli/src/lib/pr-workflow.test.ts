import { describe, test, expect } from 'bun:test'
import {
  categorizeChanges,
  generateTitle,
  generateSummary,
  generateTestPlan,
  suggestLabels,
  suggestReviewers,
  generatePRDescription,
  generateReviewSummary,
  identifyRiskyChanges,
  generateApprovalRecommendation,
  formatPRBody,
  formatReviewComment,
  generateBranchName,
  organizeCommits,
  generateCommitMessages,
  shouldSquash,
  getDefaultTemplate,
  getConventionalTemplate,
  getDetailedTemplate,
  renderTemplate,
  createPRPlan,
  getDefaultWorkflowConfig,
  type ChangeDescription,
  type PRDescription,
  type ReviewSummary,
  type PRTemplate,
  type PRWorkflowConfig,
  type CommitInfo,
} from './pr-workflow.js'
import type { PipelineResult, QualityReport } from './expert-pipeline.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePipelineResult(overrides?: Partial<PipelineResult>): PipelineResult {
  return {
    objective: 'Add user authentication',
    decomposed: false,
    subTasks: [],
    routing: [],
    executionResults: null,
    qualityReports: [],
    memoryUpdated: false,
    duration: 1000,
    stages: ['complete'],
    plan: null,
    interactiveSession: null,
    codebaseIndex: null,
    ...overrides,
  }
}

function makeQualityReport(overrides?: Partial<QualityReport>): QualityReport {
  return {
    taskId: 'task-1',
    agent: 'test-expert',
    checks: [],
    passed: 5,
    failed: 0,
    unverified: 0,
    score: 0.85,
    ...overrides,
  }
}

// ── categorizeChanges ─────────────────────────────────────────────────────────

describe('categorizeChanges', () => {
  test('classifies test files as test category', () => {
    const files = ['src/utils.test.ts', 'src/utils.spec.ts']
    const changes = categorizeChanges(files, 'add tests')
    expect(changes.length).toBeGreaterThan(0)
    expect(changes.every(c => c.category === 'test')).toBe(true)
  })

  test('classifies documentation files as docs category', () => {
    const files = ['README.md', 'docs/guide.md']
    const changes = categorizeChanges(files, 'update docs')
    expect(changes.length).toBeGreaterThan(0)
    expect(changes.every(c => c.category === 'docs')).toBe(true)
  })

  test('classifies config files as chore category', () => {
    const files = ['tsconfig.json', '.eslintrc.js']
    const changes = categorizeChanges(files, 'update config')
    expect(changes.length).toBeGreaterThan(0)
    expect(changes.every(c => c.category === 'chore')).toBe(true)
  })

  test('classifies by keyword when file patterns do not match', () => {
    const files = ['src/main.ts']
    const changes = categorizeChanges(files, 'fix login bug')
    expect(changes.length).toBe(1)
    expect(changes[0]!.category).toBe('fix')
  })

  test('defaults to feature category for unmatched files', () => {
    const files = ['src/app.ts']
    const changes = categorizeChanges(files, 'something new')
    expect(changes.length).toBe(1)
  })

  test('groups multiple files by category', () => {
    const files = ['src/auth.ts', 'src/auth.test.ts', 'README.md']
    const changes = categorizeChanges(files, 'add auth feature')
    expect(changes.length).toBeGreaterThanOrEqual(2)
  })

  test('returns empty array for empty file list', () => {
    const changes = categorizeChanges([], 'nothing')
    expect(changes).toEqual([])
  })
})

// ── generateTitle ─────────────────────────────────────────────────────────────

describe('generateTitle', () => {
  test('generates conventional commit-style title', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'Add auth', filesAffected: ['src/auth.ts'], expertId: undefined },
    ]
    const title = generateTitle('Add user authentication', changes)
    expect(title).toContain('feat')
    expect(title).toContain('Add user authentication')
  })

  test('uses most common category for prefix', () => {
    const changes: ChangeDescription[] = [
      { category: 'fix', description: 'Fix bug', filesAffected: ['a.ts', 'b.ts', 'c.ts'], expertId: undefined },
      { category: 'feature', description: 'Add feat', filesAffected: ['d.ts'], expertId: undefined },
    ]
    const title = generateTitle('Fix critical bug', changes)
    expect(title).toMatch(/^fix/)
  })

  test('truncates long objectives', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'test', filesAffected: ['a.ts'], expertId: undefined },
    ]
    const longObjective = 'A'.repeat(100)
    const title = generateTitle(longObjective, changes)
    expect(title.length).toBeLessThan(120)
    expect(title).toContain('...')
  })

  test('handles empty changes', () => {
    const title = generateTitle('something', [])
    expect(title).toContain('feat')
    expect(title).toContain('something')
  })
})

// ── generateSummary ───────────────────────────────────────────────────────────

describe('generateSummary', () => {
  test('includes objective in summary', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'test', filesAffected: ['a.ts'], expertId: undefined },
    ]
    const summary = generateSummary('Add JWT auth', changes, [])
    expect(summary).toContain('Add JWT auth')
  })

  test('includes file count and categories', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'test', filesAffected: ['a.ts', 'b.ts'], expertId: undefined },
      { category: 'test', description: 'tests', filesAffected: ['a.test.ts'], expertId: undefined },
    ]
    const summary = generateSummary('Add auth', changes, [])
    expect(summary).toContain('3 file(s)')
    expect(summary).toContain('feature')
    expect(summary).toContain('test')
  })

  test('includes expert IDs when provided', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'test', filesAffected: ['a.ts'], expertId: undefined },
    ]
    const summary = generateSummary('Add auth', changes, ['backend-expert', 'security-expert'])
    expect(summary).toContain('backend-expert')
    expect(summary).toContain('security-expert')
  })

  test('omits expert section when none provided', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'test', filesAffected: ['a.ts'], expertId: undefined },
    ]
    const summary = generateSummary('Add auth', changes, [])
    expect(summary).not.toContain('Experts involved')
  })
})

// ── generateTestPlan ──────────────────────────────────────────────────────────

describe('generateTestPlan', () => {
  test('includes feature testing steps for features', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'feat', filesAffected: ['a.ts'], expertId: undefined },
    ]
    const plan = generateTestPlan(changes)
    expect(plan.some(s => s.includes('new feature'))).toBe(true)
    expect(plan.some(s => s.includes('edge cases'))).toBe(true)
  })

  test('includes regression checks for fixes', () => {
    const changes: ChangeDescription[] = [
      { category: 'fix', description: 'fix', filesAffected: ['a.ts'], expertId: undefined },
    ]
    const plan = generateTestPlan(changes)
    expect(plan.some(s => s.includes('bug is fixed'))).toBe(true)
    expect(plan.some(s => s.includes('regressions'))).toBe(true)
  })

  test('always includes linter and security steps', () => {
    const changes: ChangeDescription[] = [
      { category: 'docs', description: 'docs', filesAffected: ['README.md'], expertId: undefined },
    ]
    const plan = generateTestPlan(changes)
    expect(plan.some(s => s.includes('linter'))).toBe(true)
    expect(plan.some(s => s.includes('security'))).toBe(true)
  })

  test('includes refactor preservation check', () => {
    const changes: ChangeDescription[] = [
      { category: 'refactor', description: 'refactor', filesAffected: ['a.ts'], expertId: undefined },
    ]
    const plan = generateTestPlan(changes)
    expect(plan.some(s => s.includes('behavior is preserved'))).toBe(true)
  })
})

// ── suggestLabels ─────────────────────────────────────────────────────────────

describe('suggestLabels', () => {
  test('suggests enhancement for feature changes', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'feat', filesAffected: ['a.ts'], expertId: undefined },
    ]
    expect(suggestLabels(changes)).toContain('enhancement')
  })

  test('suggests bug for fix changes', () => {
    const changes: ChangeDescription[] = [
      { category: 'fix', description: 'fix', filesAffected: ['a.ts'], expertId: undefined },
    ]
    expect(suggestLabels(changes)).toContain('bug')
  })

  test('suggests small label for few files', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'feat', filesAffected: ['a.ts'], expertId: undefined },
    ]
    expect(suggestLabels(changes)).toContain('small')
  })

  test('suggests large label for many files', () => {
    const files = Array.from({ length: 20 }, (_, i) => `file${i}.ts`)
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'feat', filesAffected: files, expertId: undefined },
    ]
    expect(suggestLabels(changes)).toContain('large')
  })

  test('includes multiple labels for mixed changes', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'feat', filesAffected: ['a.ts', 'b.ts', 'c.ts', 'd.ts'], expertId: undefined },
      { category: 'test', description: 'test', filesAffected: ['a.test.ts'], expertId: undefined },
    ]
    const labels = suggestLabels(changes)
    expect(labels).toContain('enhancement')
    expect(labels).toContain('testing')
  })
})

// ── suggestReviewers ──────────────────────────────────────────────────────────

describe('suggestReviewers', () => {
  test('suggests code-owner for src changes', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'feat', filesAffected: ['src/app.ts'], expertId: undefined },
    ]
    expect(suggestReviewers(changes)).toContain('code-owner')
  })

  test('suggests qa-team for test changes', () => {
    const changes: ChangeDescription[] = [
      { category: 'test', description: 'test', filesAffected: ['tests/app.test.ts'], expertId: undefined },
    ]
    expect(suggestReviewers(changes)).toContain('qa-team')
  })

  test('suggests docs-team for doc changes', () => {
    const changes: ChangeDescription[] = [
      { category: 'docs', description: 'docs', filesAffected: ['docs/guide.md'], expertId: undefined },
    ]
    expect(suggestReviewers(changes)).toContain('docs-team')
  })

  test('suggests security-team for security files', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'feat', filesAffected: ['src/auth/security.ts'], expertId: undefined },
    ]
    expect(suggestReviewers(changes)).toContain('security-team')
  })

  test('defaults to code-owner when no patterns match', () => {
    const changes: ChangeDescription[] = [
      { category: 'chore', description: 'chore', filesAffected: ['misc.txt'], expertId: undefined },
    ]
    expect(suggestReviewers(changes)).toContain('code-owner')
  })
})

// ── generateReviewSummary ─────────────────────────────────────────────────────

describe('generateReviewSummary', () => {
  test('computes quality grade from reports', () => {
    const reports = [makeQualityReport({ score: 0.95 }), makeQualityReport({ score: 0.90 })]
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'feat', filesAffected: ['a.ts'], expertId: undefined },
    ]
    const summary = generateReviewSummary(reports, changes)
    expect(summary.qualityGrade).toBe('A')
  })

  test('returns N/A grade when no reports', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'feat', filesAffected: ['a.ts'], expertId: undefined },
    ]
    const summary = generateReviewSummary([], changes)
    expect(summary.qualityGrade).toBe('N/A')
  })

  test('detects test coverage status', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'feat', filesAffected: ['a.ts'], expertId: undefined },
      { category: 'test', description: 'test', filesAffected: ['a.test.ts'], expertId: undefined },
    ]
    const summary = generateReviewSummary([], changes)
    expect(summary.testCoverage).toBe('Tests included')
  })

  test('flags missing tests', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'feat', filesAffected: ['a.ts'], expertId: undefined },
    ]
    const summary = generateReviewSummary([], changes)
    expect(summary.testCoverage).toContain('No test changes')
  })
})

// ── identifyRiskyChanges ──────────────────────────────────────────────────────

describe('identifyRiskyChanges', () => {
  test('flags security-sensitive files', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'feat', filesAffected: ['src/auth/security.ts'], expertId: undefined },
    ]
    const risks = identifyRiskyChanges(changes)
    expect(risks.some(r => r.includes('Security-sensitive'))).toBe(true)
  })

  test('flags database changes', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'feat', filesAffected: ['db/migration_001.sql'], expertId: undefined },
    ]
    const risks = identifyRiskyChanges(changes)
    expect(risks.some(r => r.includes('Database change'))).toBe(true)
  })

  test('flags configuration changes', () => {
    const changes: ChangeDescription[] = [
      { category: 'chore', description: 'chore', filesAffected: ['config/app.config.ts'], expertId: undefined },
    ]
    const risks = identifyRiskyChanges(changes)
    expect(risks.some(r => r.includes('Configuration change'))).toBe(true)
  })

  test('flags large change sets', () => {
    const files = Array.from({ length: 15 }, (_, i) => `file${i}.ts`)
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'feat', filesAffected: files, expertId: undefined },
    ]
    const risks = identifyRiskyChanges(changes)
    expect(risks.some(r => r.includes('Large change set'))).toBe(true)
  })

  test('returns empty for safe changes', () => {
    const changes: ChangeDescription[] = [
      { category: 'docs', description: 'docs', filesAffected: ['README.md'], expertId: undefined },
    ]
    const risks = identifyRiskyChanges(changes)
    expect(risks.length).toBe(0)
  })

  test('deduplicates risks', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'feat', filesAffected: ['src/auth/crypto.ts'], expertId: undefined },
    ]
    const risks = identifyRiskyChanges(changes)
    const uniqueCount = new Set(risks).size
    expect(risks.length).toBe(uniqueCount)
  })
})

// ── generateApprovalRecommendation ────────────────────────────────────────────

describe('generateApprovalRecommendation', () => {
  test('approves with good quality and tests', () => {
    const summary: ReviewSummary = {
      qualityGrade: 'A',
      testCoverage: 'Tests included',
      riskyChanges: [],
      suggestions: [],
      approvalRecommendation: 'approve',
    }
    expect(generateApprovalRecommendation(summary)).toBe('approve')
  })

  test('requests changes for low quality', () => {
    const summary: ReviewSummary = {
      qualityGrade: 'F',
      testCoverage: 'Tests included',
      riskyChanges: [],
      suggestions: [],
      approvalRecommendation: 'approve',
    }
    expect(generateApprovalRecommendation(summary)).toBe('request_changes')
  })

  test('needs discussion for many risky changes', () => {
    const summary: ReviewSummary = {
      qualityGrade: 'B',
      testCoverage: 'Tests included',
      riskyChanges: ['risk1', 'risk2', 'risk3', 'risk4'],
      suggestions: [],
      approvalRecommendation: 'approve',
    }
    expect(generateApprovalRecommendation(summary)).toBe('needs_discussion')
  })

  test('needs discussion when no tests', () => {
    const summary: ReviewSummary = {
      qualityGrade: 'B',
      testCoverage: 'No test changes detected',
      riskyChanges: [],
      suggestions: [],
      approvalRecommendation: 'approve',
    }
    expect(generateApprovalRecommendation(summary)).toBe('needs_discussion')
  })
})

// ── Template rendering ────────────────────────────────────────────────────────

describe('renderTemplate', () => {
  const description: PRDescription = {
    title: 'feat(auth): Add JWT authentication',
    summary: 'This PR adds JWT authentication.',
    changes: [
      { category: 'feature', description: 'Add JWT auth', filesAffected: ['src/auth.ts'], expertId: 'backend-expert' },
    ],
    testPlan: ['Run tests', 'Check edge cases'],
    reviewNotes: ['Security-sensitive change'],
    labels: ['enhancement'],
    relatedIssues: [],
  }

  test('renders default template with summary and changes', () => {
    const template = getDefaultTemplate()
    const output = renderTemplate(template, description)
    expect(output).toContain('## Summary')
    expect(output).toContain('## Changes')
    expect(output).toContain('JWT authentication')
  })

  test('renders conventional template with minimal sections', () => {
    const template = getConventionalTemplate()
    const output = renderTemplate(template, description)
    expect(output).toContain('## Summary')
    expect(output).toContain('## Changes')
    expect(output).not.toContain('## Test Plan')
  })

  test('renders detailed template with all sections', () => {
    const template = getDetailedTemplate()
    const reviewSummary: ReviewSummary = {
      qualityGrade: 'A',
      testCoverage: 'Tests included',
      riskyChanges: [],
      suggestions: [],
      approvalRecommendation: 'approve',
    }
    const output = renderTemplate(template, description, reviewSummary)
    expect(output).toContain('## Summary')
    expect(output).toContain('## Changes')
    expect(output).toContain('## Test Plan')
    expect(output).toContain('## Review Notes')
    expect(output).toContain('## Labels')
    expect(output).toContain('## Expert Log')
    expect(output).toContain('backend-expert')
  })

  test('renders test plan as checkboxes', () => {
    const template = getDefaultTemplate()
    template.sections.push('test_plan')
    const output = renderTemplate(template, description)
    expect(output).toContain('- [ ] Run tests')
    expect(output).toContain('- [ ] Check edge cases')
  })

  test('renders file list with backtick formatting', () => {
    const template = getDefaultTemplate()
    const output = renderTemplate(template, description)
    expect(output).toContain('`src/auth.ts`')
  })
})

// ── formatPRBody ──────────────────────────────────────────────────────────────

describe('formatPRBody', () => {
  test('produces valid markdown', () => {
    const description: PRDescription = {
      title: 'feat: test',
      summary: 'A test PR.',
      changes: [{ category: 'feature', description: 'test', filesAffected: ['a.ts'], expertId: undefined }],
      testPlan: ['Run tests'],
      reviewNotes: [],
      labels: ['enhancement'],
      relatedIssues: [],
    }
    const body = formatPRBody(description)
    expect(body).toContain('## Summary')
    expect(body).toContain('A test PR.')
  })

  test('uses specified template', () => {
    const description: PRDescription = {
      title: 'feat: test',
      summary: 'A test PR.',
      changes: [{ category: 'feature', description: 'test', filesAffected: ['a.ts'], expertId: undefined }],
      testPlan: ['Run tests'],
      reviewNotes: [],
      labels: [],
      relatedIssues: [],
    }
    const body = formatPRBody(description, getConventionalTemplate())
    expect(body).toContain('## Summary')
    expect(body).not.toContain('## Test Plan')
  })
})

// ── formatReviewComment ───────────────────────────────────────────────────────

describe('formatReviewComment', () => {
  test('includes quality grade and recommendation', () => {
    const summary: ReviewSummary = {
      qualityGrade: 'B',
      testCoverage: 'Tests included',
      riskyChanges: [],
      suggestions: [],
      approvalRecommendation: 'approve',
    }
    const comment = formatReviewComment(summary)
    expect(comment).toContain('Quality Grade')
    expect(comment).toContain('B')
    expect(comment).toContain('Approve')
  })

  test('includes risky changes section when present', () => {
    const summary: ReviewSummary = {
      qualityGrade: 'C',
      testCoverage: 'No tests',
      riskyChanges: ['Dangerous change'],
      suggestions: [],
      approvalRecommendation: 'needs_discussion',
    }
    const comment = formatReviewComment(summary)
    expect(comment).toContain('Risky Changes')
    expect(comment).toContain('Dangerous change')
  })

  test('includes suggestions when present', () => {
    const summary: ReviewSummary = {
      qualityGrade: 'A',
      testCoverage: 'Tests included',
      riskyChanges: [],
      suggestions: ['Add more tests'],
      approvalRecommendation: 'approve',
    }
    const comment = formatReviewComment(summary)
    expect(comment).toContain('Suggestions')
    expect(comment).toContain('Add more tests')
  })
})

// ── generateBranchName ────────────────────────────────────────────────────────

describe('generateBranchName', () => {
  test('conventional naming uses feat/ prefix', () => {
    const config: PRWorkflowConfig = { ...getDefaultWorkflowConfig(), branchNaming: 'conventional' }
    const name = generateBranchName('Add user auth', 'task-123', config)
    expect(name).toMatch(/^feat\//)
    expect(name).toContain('add-user-auth')
  })

  test('task_id naming uses openagent/ prefix', () => {
    const config: PRWorkflowConfig = { ...getDefaultWorkflowConfig(), branchNaming: 'task_id' }
    const name = generateBranchName('Add user auth', 'task-123', config)
    expect(name).toBe('openagent/task-123')
  })

  test('descriptive naming includes slug', () => {
    const config: PRWorkflowConfig = { ...getDefaultWorkflowConfig(), branchNaming: 'descriptive' }
    const name = generateBranchName('Add user authentication', 'task-123', config)
    expect(name).toMatch(/^openagent\/task-123\//)
    expect(name).toContain('add-user-authentication')
  })

  test('sanitizes special characters in task ID', () => {
    const name = generateBranchName('test', 'task/with@special!chars', { ...getDefaultWorkflowConfig(), branchNaming: 'task_id' })
    expect(name).not.toContain('@')
    expect(name).not.toContain('!')
  })

  test('truncates long slugs', () => {
    const longObjective = 'A very long objective that goes on and on and describes many things about the feature'
    const name = generateBranchName(longObjective, 'task-1')
    expect(name.length).toBeLessThan(100)
  })
})

// ── organizeCommits ───────────────────────────────────────────────────────────

describe('organizeCommits', () => {
  test('creates one commit per change', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'Add auth', filesAffected: ['src/auth.ts'], expertId: undefined },
      { category: 'test', description: 'Add tests', filesAffected: ['src/auth.test.ts'], expertId: undefined },
    ]
    const commits = organizeCommits(changes)
    expect(commits.length).toBe(2)
  })

  test('generates conventional commit messages', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'Add auth', filesAffected: ['src/auth.ts'], expertId: undefined },
    ]
    const commits = organizeCommits(changes)
    expect(commits[0]!.message).toMatch(/^feat/)
  })

  test('preserves expert IDs', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'Add auth', filesAffected: ['src/auth.ts'], expertId: 'backend-expert' },
    ]
    const commits = organizeCommits(changes)
    expect(commits[0]!.expertId).toBe('backend-expert')
  })

  test('includes affected files', () => {
    const changes: ChangeDescription[] = [
      { category: 'feature', description: 'Add auth', filesAffected: ['src/auth.ts', 'src/middleware.ts'], expertId: undefined },
    ]
    const commits = organizeCommits(changes)
    expect(commits[0]!.files).toEqual(['src/auth.ts', 'src/middleware.ts'])
  })
})

// ── generateCommitMessages ────────────────────────────────────────────────────

describe('generateCommitMessages', () => {
  test('extracts messages from commits', () => {
    const commits: CommitInfo[] = [
      { message: 'feat: add auth', files: ['a.ts'] },
      { message: 'test: add tests', files: ['a.test.ts'] },
    ]
    const messages = generateCommitMessages(commits)
    expect(messages).toEqual(['feat: add auth', 'test: add tests'])
  })
})

// ── shouldSquash ──────────────────────────────────────────────────────────────

describe('shouldSquash', () => {
  test('does not squash 3 or fewer commits', () => {
    const commits: CommitInfo[] = [
      { message: 'a', files: ['a.ts'] },
      { message: 'b', files: ['b.ts'] },
      { message: 'c', files: ['c.ts'] },
    ]
    expect(shouldSquash(commits)).toBe(false)
  })

  test('squashes more than 10 commits', () => {
    const commits: CommitInfo[] = Array.from({ length: 12 }, (_, i) => ({
      message: `commit-${i}`, files: [`file${i}.ts`],
    }))
    expect(shouldSquash(commits)).toBe(true)
  })

  test('squashes when most commits are small', () => {
    const commits: CommitInfo[] = Array.from({ length: 8 }, (_, i) => ({
      message: `commit-${i}`, files: i < 6 ? ['single.ts'] : [`file${i}.ts`, `extra${i}.ts`],
    }))
    expect(shouldSquash(commits)).toBe(true)
  })

  test('does not squash when commits are substantial', () => {
    const commits: CommitInfo[] = Array.from({ length: 5 }, (_, i) => ({
      message: `commit-${i}`, files: [`a${i}.ts`, `b${i}.ts`, `c${i}.ts`],
    }))
    expect(shouldSquash(commits)).toBe(false)
  })
})

// ── createPRPlan ──────────────────────────────────────────────────────────────

describe('createPRPlan', () => {
  test('creates a complete PR plan', async () => {
    const result = makePipelineResult()
    const plan = await createPRPlan('Add auth', 'task-1', result)

    expect(plan.branch).toBeTruthy()
    expect(plan.baseBranch).toBe('main')
    expect(plan.description.title).toBeTruthy()
    expect(plan.description.summary).toContain('Add auth')
  })

  test('includes review summary when quality reports exist', async () => {
    const result = makePipelineResult({
      qualityReports: [makeQualityReport({ score: 0.85 })],
    })
    const config: PRWorkflowConfig = {
      ...getDefaultWorkflowConfig(),
      template: getDetailedTemplate(),
    }
    const plan = await createPRPlan('Add auth', 'task-1', result, config)
    expect(plan.reviewSummary).toBeDefined()
    expect(plan.reviewSummary!.qualityGrade).toBeTruthy()
  })

  test('uses branch naming from config', async () => {
    const result = makePipelineResult()
    const config: PRWorkflowConfig = {
      ...getDefaultWorkflowConfig(),
      branchNaming: 'task_id',
    }
    const plan = await createPRPlan('Add auth', 'task-42', result, config)
    expect(plan.branch).toBe('openagent/task-42')
  })
})

// ── generatePRDescription ─────────────────────────────────────────────────────

describe('generatePRDescription', () => {
  test('generates a full PR description from pipeline result', () => {
    const result = makePipelineResult()
    const desc = generatePRDescription('Add user auth', result)

    expect(desc.title).toContain('feat')
    expect(desc.summary).toContain('Add user auth')
    expect(desc.testPlan.length).toBeGreaterThan(0)
    expect(desc.labels.length).toBeGreaterThan(0)
  })

  test('includes quality-related review notes', () => {
    const result = makePipelineResult({
      qualityReports: [makeQualityReport({ score: 0.72 })],
    })
    const desc = generatePRDescription('Update auth', result)
    expect(desc.reviewNotes.some(n => n.includes('quality score'))).toBe(true)
  })

  test('notes decomposed tasks', () => {
    const result = makePipelineResult({
      decomposed: true,
      subTasks: [
        { id: '1', objective: 'sub1', reason: 'r', suggestedExpertTypes: [], priority: 1, dependencies: [] },
        { id: '2', objective: 'sub2', reason: 'r', suggestedExpertTypes: [], priority: 2, dependencies: [] },
      ],
    })
    const desc = generatePRDescription('Complex task', result)
    expect(desc.reviewNotes.some(n => n.includes('sub-tasks'))).toBe(true)
  })
})

// ── Template getters ──────────────────────────────────────────────────────────

describe('template getters', () => {
  test('getDefaultTemplate returns valid template', () => {
    const t = getDefaultTemplate()
    expect(t.format).toBe('default')
    expect(t.sections).toContain('summary')
    expect(t.sections).toContain('changes')
    expect(t.includeQuality).toBe(false)
    expect(t.includeExpertLog).toBe(false)
  })

  test('getConventionalTemplate returns minimal template', () => {
    const t = getConventionalTemplate()
    expect(t.format).toBe('conventional')
    expect(t.sections).toContain('summary')
    expect(t.sections).toContain('changes')
    expect(t.sections).not.toContain('test_plan')
  })

  test('getDetailedTemplate includes all sections', () => {
    const t = getDetailedTemplate()
    expect(t.format).toBe('detailed')
    expect(t.includeQuality).toBe(true)
    expect(t.includeExpertLog).toBe(true)
    expect(t.sections).toContain('quality')
    expect(t.sections).toContain('expert_log')
    expect(t.sections).toContain('review_notes')
    expect(t.sections).toContain('labels')
  })
})
