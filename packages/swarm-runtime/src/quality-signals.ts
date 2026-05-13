// ── Types ────────────────────────────────────────────────────────────────────

export type SignalCategory = "complexity" | "consistency" | "coverage" | "safety" | "performance";
export type Grade = "A" | "B" | "C" | "D" | "F";
export type ReviewSeverity = "error" | "warning" | "info";

export interface QualitySignal {
  readonly name: string;
  readonly category: SignalCategory;
  readonly score: number;
  readonly weight: number;
  readonly details: string;
}

export interface QualityReport {
  readonly taskId: string;
  readonly expertId: string;
  readonly overallScore: number;
  readonly signals: readonly QualitySignal[];
  readonly grade: Grade;
  readonly recommendations: readonly string[];
  readonly timestamp: string;
}

export interface DiffAnalysis {
  readonly filesChanged: number;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly churnRatio: number;
  readonly complexityDelta: number;
  readonly newDependencies: readonly string[];
  readonly affectedModules: readonly string[];
}

export interface UncertainArea {
  readonly file: string;
  readonly lineRange: readonly [number, number];
  readonly reason: string;
  readonly suggestion: string;
}

export interface ConfidenceReport {
  readonly expertId: string;
  readonly taskId: string;
  readonly selfConfidence: number;
  readonly uncertainAreas: readonly UncertainArea[];
  readonly alternativeApproaches: readonly string[];
}

export interface ReviewIssue {
  readonly severity: ReviewSeverity;
  readonly file: string;
  readonly description: string;
  readonly suggestion?: string;
}

export interface ReviewResult {
  readonly approved: boolean;
  readonly issues: readonly ReviewIssue[];
  readonly suggestions: readonly string[];
  readonly reviewerId: string;
}

export interface QualityConfig {
  readonly weights: Readonly<Record<SignalCategory, number>>;
  readonly thresholds: { readonly pass: number; readonly warn: number };
  readonly enabledSignals: readonly string[];
}

export interface FileChange {
  readonly path: string;
  readonly content: string;
}

export interface ProjectConventions {
  readonly namingPattern?: RegExp;
  readonly importStyle?: "named" | "default" | "mixed";
  readonly errorHandlingPattern?: RegExp;
  readonly maxFunctionLength?: number;
  readonly maxFileLength?: number;
}

export interface ComparisonResult {
  readonly rankings: readonly { readonly expertId: string; readonly score: number; readonly grade: Grade }[];
  readonly bestExpertId: string;
  readonly worstExpertId: string;
  readonly averageScore: number;
  readonly signalBreakdown: Readonly<Record<SignalCategory, readonly { readonly expertId: string; readonly score: number }[]>>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS: Readonly<Record<SignalCategory, number>> = {
  complexity: 0.2,
  consistency: 0.2,
  coverage: 0.25,
  safety: 0.2,
  performance: 0.15,
};

const DEFAULT_THRESHOLDS = { pass: 70, warn: 50 } as const;

const DEFAULT_ENABLED_SIGNALS: readonly string[] = [
  "diff-size",
  "churn-ratio",
  "complexity-delta",
  "new-dependencies",
  "naming-conventions",
  "import-style",
  "error-handling",
  "test-coverage",
  "todo-fixme",
  "debug-statements",
  "hardcoded-values",
  "missing-error-handling",
  "large-functions",
  "deep-nesting",
];

// ── Config ───────────────────────────────────────────────────────────────────

export function getDefaultConfig(): QualityConfig {
  return {
    weights: { ...DEFAULT_WEIGHTS },
    thresholds: { ...DEFAULT_THRESHOLDS },
    enabledSignals: [...DEFAULT_ENABLED_SIGNALS],
  };
}

// ── Diff quality analysis ────────────────────────────────────────────────────

export function analyzeDiff(diff: DiffAnalysis): QualitySignal[] {
  return [
    scoreDiffSize(diff),
    scoreChurn(diff),
    scoreComplexity(diff),
    scoreNewDependencies(diff),
  ];
}

export function scoreDiffSize(diff: DiffAnalysis): QualitySignal {
  const totalLines = diff.linesAdded + diff.linesRemoved;
  let score: number;
  let details: string;

  if (totalLines === 0) {
    score = 30;
    details = "Empty diff — no changes detected";
  } else if (totalLines <= 10 && diff.filesChanged <= 1) {
    score = 60;
    details = "Very small change — possibly incomplete";
  } else if (totalLines <= 200 && diff.filesChanged <= 10) {
    score = 100;
    details = "Well-scoped change";
  } else if (totalLines <= 500) {
    score = 70;
    details = "Moderately large change — review carefully";
  } else {
    score = 40;
    details = `Very large change (${totalLines} lines across ${diff.filesChanged} files) — consider splitting`;
  }

  return { name: "diff-size", category: "complexity", score, weight: 1, details };
}

export function scoreChurn(diff: DiffAnalysis): QualitySignal {
  const { churnRatio } = diff;
  let score: number;
  let details: string;

  if (churnRatio <= 0.2) {
    score = 100;
    details = "Low churn — mostly net-new or net-removal";
  } else if (churnRatio <= 0.5) {
    score = 80;
    details = "Moderate churn — some refactoring mixed with changes";
  } else if (churnRatio <= 0.8) {
    score = 55;
    details = "High churn — significant rewriting without much net change";
  } else {
    score = 30;
    details = "Excessive churn — large rewrite with minimal net impact";
  }

  return { name: "churn-ratio", category: "complexity", score, weight: 0.8, details };
}

export function scoreComplexity(diff: DiffAnalysis): QualitySignal {
  const { complexityDelta } = diff;
  let score: number;
  let details: string;

  if (complexityDelta <= 0) {
    score = 100;
    details = complexityDelta < 0
      ? `Complexity reduced by ${Math.abs(complexityDelta)} — excellent`
      : "No complexity increase";
  } else if (complexityDelta <= 5) {
    score = 80;
    details = `Minor complexity increase (+${complexityDelta})`;
  } else if (complexityDelta <= 15) {
    score = 55;
    details = `Moderate complexity increase (+${complexityDelta}) — consider simplifying`;
  } else {
    score = 30;
    details = `Significant complexity increase (+${complexityDelta}) — needs review`;
  }

  return { name: "complexity-delta", category: "complexity", score, weight: 0.9, details };
}

function scoreNewDependencies(diff: DiffAnalysis): QualitySignal {
  const count = diff.newDependencies.length;
  let score: number;
  let details: string;

  if (count === 0) {
    score = 100;
    details = "No new dependencies added";
  } else if (count <= 2) {
    score = 80;
    details = `${count} new dependency added: ${diff.newDependencies.join(", ")}`;
  } else if (count <= 5) {
    score = 55;
    details = `${count} new dependencies — evaluate necessity`;
  } else {
    score = 30;
    details = `${count} new dependencies — excessive; review each for necessity`;
  }

  return { name: "new-dependencies", category: "safety", score, weight: 0.7, details };
}

// ── Consistency analysis ─────────────────────────────────────────────────────

export function analyzeConsistency(
  changes: readonly FileChange[],
  conventions: ProjectConventions,
): QualitySignal[] {
  const signals: QualitySignal[] = [];

  signals.push(checkNamingConventions(changes, conventions));
  signals.push(checkImportStyle(changes, conventions));
  signals.push(checkErrorHandling(changes, conventions));

  return signals;
}

function checkNamingConventions(
  changes: readonly FileChange[],
  conventions: ProjectConventions,
): QualitySignal {
  if (!conventions.namingPattern) {
    return {
      name: "naming-conventions",
      category: "consistency",
      score: 100,
      weight: 0.6,
      details: "No naming convention configured — skipped",
    };
  }

  const pattern = conventions.namingPattern;
  let violations = 0;
  let total = 0;

  for (const change of changes) {
    const declarations = change.content.match(
      /(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g,
    ) ?? [];

    for (const decl of declarations) {
      const name = decl.replace(/^(?:const|let|var|function|class|interface|type|enum)\s+/, "");
      total++;
      if (!pattern.test(name)) violations++;
    }
  }

  if (total === 0) {
    return { name: "naming-conventions", category: "consistency", score: 100, weight: 0.6, details: "No declarations to check" };
  }

  const complianceRate = 1 - violations / total;
  const score = Math.round(complianceRate * 100);
  const details = violations === 0
    ? "All declarations follow naming conventions"
    : `${violations}/${total} declarations violate naming conventions`;

  return { name: "naming-conventions", category: "consistency", score, weight: 0.6, details };
}

function checkImportStyle(
  changes: readonly FileChange[],
  conventions: ProjectConventions,
): QualitySignal {
  if (!conventions.importStyle) {
    return { name: "import-style", category: "consistency", score: 100, weight: 0.4, details: "No import style configured — skipped" };
  }

  let named = 0;
  let defaultImports = 0;

  for (const change of changes) {
    const namedMatches = change.content.match(/import\s*\{[^}]+\}\s*from/g) ?? [];
    const defaultMatches = change.content.match(/import\s+\w+\s+from/g) ?? [];
    named += namedMatches.length;
    defaultImports += defaultMatches.length;
  }

  const total = named + defaultImports;
  if (total === 0) {
    return { name: "import-style", category: "consistency", score: 100, weight: 0.4, details: "No imports to check" };
  }

  let score: number;
  let details: string;

  if (conventions.importStyle === "named") {
    const ratio = named / total;
    score = Math.round(ratio * 100);
    details = ratio === 1 ? "All imports use named style" : `${defaultImports} imports use default style (expected named)`;
  } else if (conventions.importStyle === "default") {
    const ratio = defaultImports / total;
    score = Math.round(ratio * 100);
    details = ratio === 1 ? "All imports use default style" : `${named} imports use named style (expected default)`;
  } else {
    score = 100;
    details = "Mixed import style accepted";
  }

  return { name: "import-style", category: "consistency", score, weight: 0.4, details };
}

function checkErrorHandling(
  changes: readonly FileChange[],
  conventions: ProjectConventions,
): QualitySignal {
  if (!conventions.errorHandlingPattern) {
    return { name: "error-handling", category: "consistency", score: 100, weight: 0.5, details: "No error handling convention configured — skipped" };
  }

  let hasErrorHandling = false;
  let followsPattern = true;

  for (const change of changes) {
    const catchBlocks = change.content.match(/catch\s*\([^)]*\)\s*\{[^}]*\}/g) ?? [];
    if (catchBlocks.length > 0) {
      hasErrorHandling = true;
      for (const block of catchBlocks) {
        if (!conventions.errorHandlingPattern.test(block)) {
          followsPattern = false;
        }
      }
    }
  }

  if (!hasErrorHandling) {
    return { name: "error-handling", category: "consistency", score: 70, weight: 0.5, details: "No error handling found in changes" };
  }

  const score = followsPattern ? 100 : 50;
  const details = followsPattern
    ? "Error handling follows project conventions"
    : "Error handling does not follow project conventions";

  return { name: "error-handling", category: "consistency", score, weight: 0.5, details };
}

// ── Coverage analysis ────────────────────────────────────────────────────────

export function analyzeCoverage(
  changes: readonly FileChange[],
  existingTests: readonly string[],
): QualitySignal[] {
  const changedFiles = changes.map((c) => c.path);
  return [
    scoreTestCoverage(changedFiles, existingTests),
    scoreTestQuality(changes),
  ];
}

export function scoreTestCoverage(
  changedFiles: readonly string[],
  testFiles: readonly string[],
): QualitySignal {
  const sourceFiles = changedFiles.filter((f) => !isTestFile(f));
  if (sourceFiles.length === 0) {
    return { name: "test-coverage", category: "coverage", score: 100, weight: 1, details: "Only test files changed" };
  }

  const testSet = new Set(testFiles.map(normalizeTestPath));
  let covered = 0;

  for (const file of sourceFiles) {
    const expectedTest = deriveTestPath(file);
    if (testSet.has(normalizeTestPath(expectedTest)) || changedFiles.some((f) => isTestFile(f) && isTestFor(f, file))) {
      covered++;
    }
  }

  const ratio = covered / sourceFiles.length;
  const score = Math.round(ratio * 100);
  const details = ratio === 1
    ? "All changed source files have corresponding tests"
    : `${sourceFiles.length - covered}/${sourceFiles.length} changed source files lack test coverage`;

  return { name: "test-coverage", category: "coverage", score, weight: 1, details };
}

function scoreTestQuality(changes: readonly FileChange[]): QualitySignal {
  const testChanges = changes.filter((c) => isTestFile(c.path));

  if (testChanges.length === 0) {
    return { name: "test-quality", category: "coverage", score: 50, weight: 0.6, details: "No test files in changes" };
  }

  let assertions = 0;
  let describes = 0;

  for (const test of testChanges) {
    assertions += (test.content.match(/expect\s*\(|assert\s*[.(]/g) ?? []).length;
    describes += (test.content.match(/(?:describe|it|test)\s*\(/g) ?? []).length;
  }

  let score: number;
  let details: string;

  if (assertions >= 5 && describes >= 2) {
    score = 100;
    details = `Good test structure: ${assertions} assertions across ${describes} test blocks`;
  } else if (assertions >= 2) {
    score = 70;
    details = `Minimal tests: ${assertions} assertions — consider adding more`;
  } else {
    score = 40;
    details = `Very few assertions (${assertions}) — tests may be insufficient`;
  }

  return { name: "test-quality", category: "coverage", score, weight: 0.6, details };
}

function isTestFile(path: string): boolean {
  return /\.(test|spec)\.\w+$/.test(path) || /\/__tests__\//.test(path);
}

function normalizeTestPath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

function deriveTestPath(sourcePath: string): string {
  const ext = sourcePath.match(/\.\w+$/)?.[0] ?? ".ts";
  return sourcePath.replace(new RegExp(`${ext.replace(".", "\\.")}$`), `.test${ext}`);
}

function isTestFor(testPath: string, sourcePath: string): boolean {
  const sourceBase = sourcePath.replace(/\.\w+$/, "").replace(/.*\//, "");
  return testPath.toLowerCase().includes(sourceBase.toLowerCase());
}

// ── Confidence reporting ─────────────────────────────────────────────────────

export function createConfidenceReport(
  expertId: string,
  taskId: string,
  selfConfidence: number,
  uncertainAreas: readonly UncertainArea[] = [],
  alternativeApproaches: readonly string[] = [],
): ConfidenceReport {
  return {
    expertId,
    taskId,
    selfConfidence: clamp(selfConfidence, 0, 1),
    uncertainAreas: [...uncertainAreas],
    alternativeApproaches: [...alternativeApproaches],
  };
}

export function aggregateConfidence(
  reports: readonly ConfidenceReport[],
): { average: number; lowest: number; highestUncertainty: string | undefined } {
  if (reports.length === 0) {
    return { average: 0, lowest: 0, highestUncertainty: undefined };
  }

  const confidences = reports.map((r) => r.selfConfidence);
  const average = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
  const lowest = Math.min(...confidences);

  let maxUncertainty = 0;
  let highestUncertainty: string | undefined;

  for (const report of reports) {
    if (report.uncertainAreas.length > maxUncertainty) {
      maxUncertainty = report.uncertainAreas.length;
      highestUncertainty = report.expertId;
    }
  }

  return { average, lowest, highestUncertainty };
}

// ── Automated review ─────────────────────────────────────────────────────────

export function autoReview(
  changes: readonly FileChange[],
  config?: QualityConfig,
): ReviewResult {
  const enabled = new Set(config?.enabledSignals ?? DEFAULT_ENABLED_SIGNALS);
  const issues: ReviewIssue[] = [];
  const suggestions: string[] = [];

  for (const change of changes) {
    if (enabled.has("todo-fixme")) {
      issues.push(...detectTodoFixme(change));
    }
    if (enabled.has("debug-statements")) {
      issues.push(...detectDebugStatements(change));
    }
    if (enabled.has("hardcoded-values")) {
      issues.push(...detectHardcodedValues(change));
    }
    if (enabled.has("missing-error-handling")) {
      issues.push(...detectMissingErrorHandling(change));
    }
    if (enabled.has("large-functions")) {
      issues.push(...detectLargeFunctions(change));
    }
    if (enabled.has("deep-nesting")) {
      issues.push(...detectDeepNesting(change));
    }
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  if (errorCount > 0) {
    suggestions.push(`Fix ${errorCount} error(s) before merging`);
  }
  if (warningCount > 3) {
    suggestions.push("Consider addressing warnings to improve code quality");
  }

  return {
    approved: errorCount === 0,
    issues,
    suggestions,
    reviewerId: "auto-reviewer",
  };
}

function detectTodoFixme(change: FileChange): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const matches = change.content.match(/\/\/\s*(TODO|FIXME|HACK|XXX)\b[^\n]*/gi) ?? [];

  for (const match of matches) {
    issues.push({
      severity: "warning",
      file: change.path,
      description: `Unresolved marker: ${match.trim()}`,
      suggestion: "Resolve or create a tracked issue",
    });
  }

  return issues;
}

function detectDebugStatements(change: FileChange): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const patterns = [
    /console\.(log|debug|info|warn|error)\s*\(/g,
    /debugger\s*;/g,
  ];

  for (const pattern of patterns) {
    const matches = change.content.match(pattern) ?? [];
    for (const match of matches) {
      issues.push({
        severity: "warning",
        file: change.path,
        description: `Debug statement found: ${match.trim()}`,
        suggestion: "Remove or replace with proper logging",
      });
    }
  }

  return issues;
}

function detectHardcodedValues(change: FileChange): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const patterns = [
    { regex: /(?:localhost|127\.0\.0\.1):\d+/g, label: "hardcoded URL" },
    { regex: /(?:password|secret|token|api_?key)\s*[:=]\s*["'][^"']+["']/gi, label: "potential hardcoded secret" },
  ];

  for (const { regex, label } of patterns) {
    const matches = change.content.match(regex) ?? [];
    for (const match of matches) {
      issues.push({
        severity: "error",
        file: change.path,
        description: `${label}: ${match.length > 40 ? match.slice(0, 40) + "..." : match}`,
        suggestion: "Use environment variables or configuration",
      });
    }
  }

  return issues;
}

function detectMissingErrorHandling(change: FileChange): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  const asyncFunctions = change.content.match(/async\s+\w+\s*\([^)]*\)\s*(?::\s*\w+[^{]*)?\{/g) ?? [];
  for (const fn of asyncFunctions) {
    const fnName = fn.match(/async\s+(\w+)/)?.[1] ?? "anonymous";
    const fnStart = change.content.indexOf(fn);
    const fnBody = extractBlock(change.content, fnStart + fn.length - 1);

    if (fnBody && /await\s/.test(fnBody) && !/try\s*\{/.test(fnBody) && !/\.catch\s*\(/.test(fnBody)) {
      issues.push({
        severity: "warning",
        file: change.path,
        description: `Async function '${fnName}' uses await without try/catch or .catch()`,
        suggestion: "Add error handling for async operations",
      });
    }
  }

  return issues;
}

function detectLargeFunctions(change: FileChange): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const fnPattern = /(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)\s*\{?/g;
  let match: RegExpExecArray | null;

  while ((match = fnPattern.exec(change.content)) !== null) {
    const fnName = match[1] ?? match[2] ?? "anonymous";
    const startIndex = match.index + match[0].length;
    const body = extractBlock(change.content, startIndex - 1);

    if (body) {
      const lineCount = body.split("\n").length;
      if (lineCount > 50) {
        issues.push({
          severity: "warning",
          file: change.path,
          description: `Function '${fnName}' is ${lineCount} lines — consider breaking it up`,
          suggestion: "Extract sub-functions to improve readability",
        });
      }
    }
  }

  return issues;
}

function detectDeepNesting(change: FileChange): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  let maxDepth = 0;
  let depth = 0;

  for (const char of change.content) {
    if (char === "{") {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    }
    if (char === "}") depth = Math.max(0, depth - 1);
  }

  if (maxDepth > 5) {
    issues.push({
      severity: "warning",
      file: change.path,
      description: `Deep nesting detected (depth ${maxDepth}) — code may be hard to follow`,
      suggestion: "Use early returns or extract helper functions to reduce nesting",
    });
  }

  return issues;
}

function extractBlock(content: string, openBraceIndex: number): string | undefined {
  if (content[openBraceIndex] !== "{") return undefined;
  let depth = 0;
  let start = openBraceIndex;

  for (let i = openBraceIndex; i < content.length; i++) {
    if (content[i] === "{") depth++;
    if (content[i] === "}") {
      depth--;
      if (depth === 0) {
        return content.slice(start, i + 1);
      }
    }
  }

  return undefined;
}

// ── Overall quality scoring ──────────────────────────────────────────────────

export function generateQualityReport(
  taskId: string,
  expertId: string,
  signals: readonly QualitySignal[],
  config?: QualityConfig,
): QualityReport {
  const resolvedConfig = config ?? getDefaultConfig();
  const overallScore = computeWeightedScore(signals, resolvedConfig);
  const grade = scoreToGrade(overallScore);
  const recommendations = generateRecommendations(signals, overallScore);

  return {
    taskId,
    expertId,
    overallScore,
    signals: [...signals],
    grade,
    recommendations,
    timestamp: new Date().toISOString(),
  };
}

export function compareReports(reports: readonly QualityReport[]): ComparisonResult {
  if (reports.length === 0) {
    return {
      rankings: [],
      bestExpertId: "",
      worstExpertId: "",
      averageScore: 0,
      signalBreakdown: { complexity: [], consistency: [], coverage: [], safety: [], performance: [] },
    };
  }

  const rankings = [...reports]
    .sort((a, b) => b.overallScore - a.overallScore)
    .map((r) => ({ expertId: r.expertId, score: r.overallScore, grade: r.grade }));

  const averageScore = Math.round(
    reports.reduce((sum, r) => sum + r.overallScore, 0) / reports.length,
  );

  const categories: SignalCategory[] = ["complexity", "consistency", "coverage", "safety", "performance"];
  const signalBreakdown: Record<SignalCategory, { expertId: string; score: number }[]> = {
    complexity: [],
    consistency: [],
    coverage: [],
    safety: [],
    performance: [],
  };

  for (const category of categories) {
    for (const report of reports) {
      const categorySignals = report.signals.filter((s) => s.category === category);
      if (categorySignals.length > 0) {
        const avg = Math.round(
          categorySignals.reduce((sum, s) => sum + s.score, 0) / categorySignals.length,
        );
        signalBreakdown[category].push({ expertId: report.expertId, score: avg });
      }
    }
    signalBreakdown[category].sort((a, b) => b.score - a.score);
  }

  return {
    rankings,
    bestExpertId: rankings[0]!.expertId,
    worstExpertId: rankings[rankings.length - 1]!.expertId,
    averageScore,
    signalBreakdown,
  };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function computeWeightedScore(
  signals: readonly QualitySignal[],
  config: QualityConfig,
): number {
  if (signals.length === 0) return 0;

  let totalWeight = 0;
  let weightedSum = 0;

  for (const signal of signals) {
    const categoryWeight = config.weights[signal.category] ?? 0.1;
    const effectiveWeight = signal.weight * categoryWeight;
    weightedSum += signal.score * effectiveWeight;
    totalWeight += effectiveWeight;
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

function scoreToGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function generateRecommendations(
  signals: readonly QualitySignal[],
  overallScore: number,
): string[] {
  const recommendations: string[] = [];

  const lowSignals = signals.filter((s) => s.score < 60);
  for (const signal of lowSignals) {
    recommendations.push(`Improve ${signal.name}: ${signal.details}`);
  }

  if (overallScore < 50) {
    recommendations.push("Overall quality is below threshold — consider rework");
  }

  const categories = new Set(signals.map((s) => s.category));
  const allCategories: SignalCategory[] = ["complexity", "consistency", "coverage", "safety", "performance"];
  for (const cat of allCategories) {
    if (!categories.has(cat)) {
      recommendations.push(`No signals for '${cat}' — consider adding analysis`);
    }
  }

  return recommendations;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
