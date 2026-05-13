import { describe, expect, it } from "bun:test";

import {
  analyzeCoverage,
  analyzeConsistency,
  analyzeDiff,
  aggregateConfidence,
  autoReview,
  compareReports,
  createConfidenceReport,
  generateQualityReport,
  getDefaultConfig,
  scoreChurn,
  scoreComplexity,
  scoreDiffSize,
  scoreTestCoverage,
  type DiffAnalysis,
  type FileChange,
  type ProjectConventions,
  type QualityConfig,
  type QualityReport,
  type QualitySignal,
} from "./quality-signals.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDiff(overrides: Partial<DiffAnalysis> = {}): DiffAnalysis {
  return {
    filesChanged: 3,
    linesAdded: 50,
    linesRemoved: 10,
    churnRatio: 0.15,
    complexityDelta: 2,
    newDependencies: [],
    affectedModules: ["core"],
    ...overrides,
  };
}

function makeChange(path: string, content: string): FileChange {
  return { path, content };
}

function makeSignal(overrides: Partial<QualitySignal> = {}): QualitySignal {
  return {
    name: "test-signal",
    category: "complexity",
    score: 80,
    weight: 1,
    details: "test",
    ...overrides,
  };
}

// ── Diff analysis scoring ────────────────────────────────────────────────────

describe("scoreDiffSize", () => {
  it("scores a well-scoped diff highly", () => {
    const signal = scoreDiffSize(makeDiff({ linesAdded: 80, linesRemoved: 20, filesChanged: 4 }));
    expect(signal.score).toBe(100);
    expect(signal.category).toBe("complexity");
    expect(signal.name).toBe("diff-size");
  });

  it("penalizes empty diffs", () => {
    const signal = scoreDiffSize(makeDiff({ linesAdded: 0, linesRemoved: 0, filesChanged: 0 }));
    expect(signal.score).toBeLessThan(50);
  });

  it("penalizes very small diffs", () => {
    const signal = scoreDiffSize(makeDiff({ linesAdded: 3, linesRemoved: 1, filesChanged: 1 }));
    expect(signal.score).toBeLessThan(80);
  });

  it("penalizes very large diffs", () => {
    const signal = scoreDiffSize(makeDiff({ linesAdded: 800, linesRemoved: 300, filesChanged: 25 }));
    expect(signal.score).toBeLessThan(50);
  });

  it("scores moderately large diffs at 70", () => {
    const signal = scoreDiffSize(makeDiff({ linesAdded: 300, linesRemoved: 100, filesChanged: 8 }));
    expect(signal.score).toBe(70);
  });
});

describe("scoreChurn", () => {
  it("scores low churn highly", () => {
    const signal = scoreChurn(makeDiff({ churnRatio: 0.1 }));
    expect(signal.score).toBe(100);
  });

  it("scores moderate churn at 80", () => {
    const signal = scoreChurn(makeDiff({ churnRatio: 0.4 }));
    expect(signal.score).toBe(80);
  });

  it("penalizes high churn", () => {
    const signal = scoreChurn(makeDiff({ churnRatio: 0.7 }));
    expect(signal.score).toBeLessThan(60);
  });

  it("penalizes excessive churn", () => {
    const signal = scoreChurn(makeDiff({ churnRatio: 0.95 }));
    expect(signal.score).toBe(30);
  });
});

describe("scoreComplexity", () => {
  it("rewards complexity reduction", () => {
    const signal = scoreComplexity(makeDiff({ complexityDelta: -5 }));
    expect(signal.score).toBe(100);
    expect(signal.details).toContain("reduced");
  });

  it("rewards no complexity increase", () => {
    const signal = scoreComplexity(makeDiff({ complexityDelta: 0 }));
    expect(signal.score).toBe(100);
  });

  it("accepts minor complexity increase", () => {
    const signal = scoreComplexity(makeDiff({ complexityDelta: 3 }));
    expect(signal.score).toBe(80);
  });

  it("warns on significant complexity increase", () => {
    const signal = scoreComplexity(makeDiff({ complexityDelta: 20 }));
    expect(signal.score).toBe(30);
  });
});

describe("analyzeDiff", () => {
  it("returns four signals", () => {
    const signals = analyzeDiff(makeDiff());
    expect(signals).toHaveLength(4);
    const names = signals.map((s) => s.name);
    expect(names).toContain("diff-size");
    expect(names).toContain("churn-ratio");
    expect(names).toContain("complexity-delta");
    expect(names).toContain("new-dependencies");
  });

  it("scores new dependencies appropriately", () => {
    const signals = analyzeDiff(makeDiff({ newDependencies: ["lodash", "axios", "moment", "react", "vue", "svelte"] }));
    const depSignal = signals.find((s) => s.name === "new-dependencies")!;
    expect(depSignal.score).toBe(30);
  });

  it("gives perfect dep score when none added", () => {
    const signals = analyzeDiff(makeDiff({ newDependencies: [] }));
    const depSignal = signals.find((s) => s.name === "new-dependencies")!;
    expect(depSignal.score).toBe(100);
  });

  it("handles refactoring churn pattern", () => {
    const signals = analyzeDiff(makeDiff({
      linesAdded: 200,
      linesRemoved: 190,
      churnRatio: 0.85,
      complexityDelta: 0,
    }));
    const churnSignal = signals.find((s) => s.name === "churn-ratio")!;
    expect(churnSignal.score).toBe(30);
  });
});

// ── Consistency checks ───────────────────────────────────────────────────────

describe("analyzeConsistency", () => {
  const conventions: ProjectConventions = {
    namingPattern: /^[a-z][a-zA-Z0-9]*$/,
    importStyle: "named",
    errorHandlingPattern: /catch/,
  };

  it("returns three signals", () => {
    const changes = [makeChange("src/foo.ts", 'const myVar = 1;\nimport { bar } from "./bar";')];
    const signals = analyzeConsistency(changes, conventions);
    expect(signals).toHaveLength(3);
  });

  it("scores matching conventions highly", () => {
    const changes = [makeChange("src/foo.ts", 'const myVar = 1;\nimport { bar } from "./bar";\ntry { x(); } catch (e) { throw e; }')];
    const signals = analyzeConsistency(changes, conventions);
    const naming = signals.find((s) => s.name === "naming-conventions")!;
    expect(naming.score).toBe(100);
  });

  it("penalizes naming violations", () => {
    const changes = [makeChange("src/foo.ts", "const MyBadVar = 1;\nconst AnotherBad = 2;\nconst good = 3;")];
    const signals = analyzeConsistency(changes, conventions);
    const naming = signals.find((s) => s.name === "naming-conventions")!;
    expect(naming.score).toBeLessThan(100);
  });

  it("detects wrong import style", () => {
    const changes = [makeChange("src/foo.ts", 'import React from "react";\nimport Vue from "vue";')];
    const signals = analyzeConsistency(changes, conventions);
    const importSignal = signals.find((s) => s.name === "import-style")!;
    expect(importSignal.score).toBe(0);
  });

  it("skips checks when no conventions configured", () => {
    const changes = [makeChange("src/foo.ts", "const x = 1;")];
    const signals = analyzeConsistency(changes, {});
    expect(signals.every((s) => s.score === 100)).toBe(true);
  });
});

// ── Coverage analysis ────────────────────────────────────────────────────────

describe("analyzeCoverage", () => {
  it("scores fully covered changes at 100", () => {
    const changes = [
      makeChange("src/utils.ts", "export function foo() {}"),
      makeChange("src/utils.test.ts", 'import { foo } from "./utils";\ndescribe("foo", () => { it("works", () => { expect(foo()).toBeDefined(); }); });'),
    ];
    const signal = scoreTestCoverage(
      changes.map((c) => c.path),
      ["src/utils.test.ts"],
    );
    expect(signal.score).toBe(100);
  });

  it("penalizes uncovered changes", () => {
    const changes = [makeChange("src/api.ts", "export function handler() {}")];
    const signal = scoreTestCoverage(
      changes.map((c) => c.path),
      [],
    );
    expect(signal.score).toBe(0);
  });

  it("handles only test files changed", () => {
    const changes = [makeChange("src/foo.test.ts", "test('x', () => {})")];
    const signal = scoreTestCoverage(
      changes.map((c) => c.path),
      ["src/foo.test.ts"],
    );
    expect(signal.score).toBe(100);
  });

  it("analyzeCoverage returns coverage + quality signals", () => {
    const changes = [
      makeChange("src/core.ts", "export function core() { return 1; }"),
      makeChange("src/core.test.ts", 'describe("core", () => { it("returns 1", () => { expect(core()).toBe(1); }); it("is defined", () => { expect(core).toBeDefined(); }); });'),
    ];
    const signals = analyzeCoverage(changes, ["src/core.test.ts"]);
    expect(signals).toHaveLength(2);
    expect(signals.map((s) => s.name)).toContain("test-coverage");
    expect(signals.map((s) => s.name)).toContain("test-quality");
  });
});

// ── Confidence reporting ─────────────────────────────────────────────────────

describe("createConfidenceReport", () => {
  it("creates a report with default empty arrays", () => {
    const report = createConfidenceReport("expert-1", "task-1", 0.85);
    expect(report.expertId).toBe("expert-1");
    expect(report.taskId).toBe("task-1");
    expect(report.selfConfidence).toBe(0.85);
    expect(report.uncertainAreas).toEqual([]);
    expect(report.alternativeApproaches).toEqual([]);
  });

  it("clamps confidence to [0, 1]", () => {
    const tooHigh = createConfidenceReport("e", "t", 1.5);
    expect(tooHigh.selfConfidence).toBe(1);
    const tooLow = createConfidenceReport("e", "t", -0.5);
    expect(tooLow.selfConfidence).toBe(0);
  });

  it("includes uncertain areas and alternatives", () => {
    const report = createConfidenceReport("e1", "t1", 0.6, [
      { file: "src/a.ts", lineRange: [10, 20], reason: "unclear spec", suggestion: "clarify" },
    ], ["alternative approach A"]);
    expect(report.uncertainAreas).toHaveLength(1);
    expect(report.alternativeApproaches).toHaveLength(1);
  });
});

describe("aggregateConfidence", () => {
  it("computes average and lowest across reports", () => {
    const reports = [
      createConfidenceReport("e1", "t1", 0.9),
      createConfidenceReport("e2", "t1", 0.6),
      createConfidenceReport("e3", "t1", 0.75),
    ];
    const result = aggregateConfidence(reports);
    expect(result.average).toBeCloseTo(0.75, 2);
    expect(result.lowest).toBe(0.6);
  });

  it("identifies expert with most uncertain areas", () => {
    const reports = [
      createConfidenceReport("e1", "t1", 0.9),
      createConfidenceReport("e2", "t1", 0.8, [
        { file: "a.ts", lineRange: [1, 5], reason: "complex", suggestion: "simplify" },
        { file: "b.ts", lineRange: [10, 15], reason: "unclear", suggestion: "docs" },
      ]),
    ];
    const result = aggregateConfidence(reports);
    expect(result.highestUncertainty).toBe("e2");
  });

  it("handles empty reports array", () => {
    const result = aggregateConfidence([]);
    expect(result.average).toBe(0);
    expect(result.lowest).toBe(0);
    expect(result.highestUncertainty).toBeUndefined();
  });
});

// ── Auto-review issue detection ──────────────────────────────────────────────

describe("autoReview", () => {
  it("detects TODO/FIXME markers", () => {
    const changes = [makeChange("src/a.ts", "// TODO: fix this later\nconst x = 1;")];
    const result = autoReview(changes);
    expect(result.issues.some((i) => i.description.includes("TODO"))).toBe(true);
  });

  it("detects console.log statements", () => {
    const changes = [makeChange("src/b.ts", 'console.log("debug");\nconsole.debug("test");')];
    const result = autoReview(changes);
    const debugIssues = result.issues.filter((i) => i.description.includes("console"));
    expect(debugIssues.length).toBeGreaterThanOrEqual(2);
  });

  it("detects hardcoded values", () => {
    const changes = [makeChange("src/c.ts", 'const url = "localhost:3000/api";')];
    const result = autoReview(changes);
    expect(result.approved).toBe(false);
    expect(result.issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("detects deep nesting", () => {
    const nested = "if (a) { if (b) { if (c) { if (d) { if (e) { if (f) { x(); } } } } } }";
    const changes = [makeChange("src/d.ts", nested)];
    const result = autoReview(changes);
    expect(result.issues.some((i) => i.description.includes("nesting"))).toBe(true);
  });

  it("approves clean code", () => {
    const changes = [makeChange("src/clean.ts", 'export function add(a: number, b: number): number {\n  return a + b;\n}')];
    const result = autoReview(changes);
    expect(result.approved).toBe(true);
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("respects enabledSignals config", () => {
    const changes = [makeChange("src/e.ts", '// TODO: something\nconsole.log("hi");')];
    const config: QualityConfig = {
      ...getDefaultConfig(),
      enabledSignals: ["todo-fixme"],
    };
    const result = autoReview(changes, config);
    expect(result.issues.some((i) => i.description.includes("TODO"))).toBe(true);
    expect(result.issues.some((i) => i.description.includes("console"))).toBe(false);
  });

  it("provides suggestions when errors exist", () => {
    const changes = [makeChange("src/f.ts", 'const secret = "password=hunter2";')];
    const result = autoReview(changes);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});

// ── Quality report generation and grading ────────────────────────────────────

describe("generateQualityReport", () => {
  it("generates a report with grade A for high scores", () => {
    const signals: QualitySignal[] = [
      makeSignal({ name: "s1", category: "complexity", score: 95 }),
      makeSignal({ name: "s2", category: "coverage", score: 90 }),
      makeSignal({ name: "s3", category: "consistency", score: 92 }),
    ];
    const report = generateQualityReport("task-1", "expert-1", signals);
    expect(report.grade).toBe("A");
    expect(report.overallScore).toBeGreaterThanOrEqual(90);
    expect(report.taskId).toBe("task-1");
    expect(report.expertId).toBe("expert-1");
    expect(report.timestamp).toBeDefined();
  });

  it("generates grade F for very low scores", () => {
    const signals: QualitySignal[] = [
      makeSignal({ name: "s1", category: "complexity", score: 10 }),
      makeSignal({ name: "s2", category: "safety", score: 20 }),
    ];
    const report = generateQualityReport("task-1", "expert-1", signals);
    expect(report.grade).toBe("F");
    expect(report.overallScore).toBeLessThan(40);
  });

  it("provides recommendations for low signals", () => {
    const signals: QualitySignal[] = [
      makeSignal({ name: "bad-signal", category: "safety", score: 30, details: "security issue found" }),
    ];
    const report = generateQualityReport("task-1", "expert-1", signals);
    expect(report.recommendations.some((r) => r.includes("bad-signal"))).toBe(true);
  });

  it("handles empty signals array", () => {
    const report = generateQualityReport("task-1", "expert-1", []);
    expect(report.overallScore).toBe(0);
    expect(report.grade).toBe("F");
  });

  it("respects custom config weights", () => {
    const signals: QualitySignal[] = [
      makeSignal({ name: "s1", category: "complexity", score: 100, weight: 1 }),
      makeSignal({ name: "s2", category: "safety", score: 0, weight: 1 }),
    ];
    const heavySafety: QualityConfig = {
      weights: { complexity: 0.1, consistency: 0.1, coverage: 0.1, safety: 0.9, performance: 0.1 },
      thresholds: { pass: 70, warn: 50 },
      enabledSignals: [],
    };
    const report = generateQualityReport("t", "e", signals, heavySafety);
    expect(report.overallScore).toBeLessThan(30);
  });

  it("assigns correct grade boundaries", () => {
    const gradeCheck = (score: number): string => {
      const signals = [makeSignal({ score, weight: 1, category: "complexity" })];
      return generateQualityReport("t", "e", signals).grade;
    };
    expect(gradeCheck(95)).toBe("A");
    expect(gradeCheck(80)).toBe("B");
    expect(gradeCheck(65)).toBe("C");
    expect(gradeCheck(45)).toBe("D");
    expect(gradeCheck(20)).toBe("F");
  });
});

// ── Report comparison ────────────────────────────────────────────────────────

describe("compareReports", () => {
  function makeReport(expertId: string, score: number, grade: "A" | "B" | "C" | "D" | "F"): QualityReport {
    return {
      taskId: "task-1",
      expertId,
      overallScore: score,
      signals: [
        makeSignal({ category: "complexity", score }),
        makeSignal({ category: "coverage", score: score - 5 }),
      ],
      grade,
      recommendations: [],
      timestamp: new Date().toISOString(),
    };
  }

  it("ranks experts by score", () => {
    const reports = [makeReport("e1", 90, "A"), makeReport("e2", 60, "C"), makeReport("e3", 75, "B")];
    const result = compareReports(reports);
    expect(result.rankings[0]!.expertId).toBe("e1");
    expect(result.rankings[2]!.expertId).toBe("e2");
  });

  it("identifies best and worst experts", () => {
    const reports = [makeReport("e1", 90, "A"), makeReport("e2", 40, "D")];
    const result = compareReports(reports);
    expect(result.bestExpertId).toBe("e1");
    expect(result.worstExpertId).toBe("e2");
  });

  it("computes average score", () => {
    const reports = [makeReport("e1", 80, "B"), makeReport("e2", 60, "C")];
    const result = compareReports(reports);
    expect(result.averageScore).toBe(70);
  });

  it("provides signal breakdown by category", () => {
    const reports = [makeReport("e1", 90, "A"), makeReport("e2", 70, "B")];
    const result = compareReports(reports);
    expect(result.signalBreakdown.complexity.length).toBe(2);
    expect(result.signalBreakdown.complexity[0]!.expertId).toBe("e1");
  });

  it("handles empty reports array", () => {
    const result = compareReports([]);
    expect(result.rankings).toHaveLength(0);
    expect(result.bestExpertId).toBe("");
    expect(result.averageScore).toBe(0);
  });
});

// ── Config ───────────────────────────────────────────────────────────────────

describe("getDefaultConfig", () => {
  it("returns a complete config", () => {
    const config = getDefaultConfig();
    expect(config.weights.complexity).toBeDefined();
    expect(config.weights.consistency).toBeDefined();
    expect(config.weights.coverage).toBeDefined();
    expect(config.weights.safety).toBeDefined();
    expect(config.weights.performance).toBeDefined();
    expect(config.thresholds.pass).toBeGreaterThan(config.thresholds.warn);
    expect(config.enabledSignals.length).toBeGreaterThan(0);
  });

  it("returns a fresh object each time (immutable)", () => {
    const a = getDefaultConfig();
    const b = getDefaultConfig();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles files with no declarations for consistency", () => {
    const changes = [makeChange("readme.md", "# Title\nSome text")];
    const signals = analyzeConsistency(changes, { namingPattern: /^[a-z]+$/ });
    const naming = signals.find((s) => s.name === "naming-conventions")!;
    expect(naming.score).toBe(100);
  });

  it("handles files with no imports for consistency", () => {
    const changes = [makeChange("src/plain.ts", "const x = 1;")];
    const signals = analyzeConsistency(changes, { importStyle: "named" });
    const importSignal = signals.find((s) => s.name === "import-style")!;
    expect(importSignal.score).toBe(100);
  });

  it("diff with exactly 2 new dependencies scores 80", () => {
    const signals = analyzeDiff(makeDiff({ newDependencies: ["a", "b"] }));
    const dep = signals.find((s) => s.name === "new-dependencies")!;
    expect(dep.score).toBe(80);
  });

  it("generateQualityReport produces immutable signals array", () => {
    const input = [makeSignal({ name: "x" })];
    const report = generateQualityReport("t", "e", input);
    expect(report.signals).not.toBe(input);
    expect(report.signals).toEqual(input);
  });

  it("autoReview detects FIXME and HACK markers", () => {
    const changes = [makeChange("src/g.ts", "// FIXME: broken\n// HACK: workaround")];
    const result = autoReview(changes);
    expect(result.issues.filter((i) => i.description.includes("FIXME") || i.description.includes("HACK")).length).toBeGreaterThanOrEqual(2);
  });

  it("confidence report with exact boundary values", () => {
    const atZero = createConfidenceReport("e", "t", 0);
    expect(atZero.selfConfidence).toBe(0);
    const atOne = createConfidenceReport("e", "t", 1);
    expect(atOne.selfConfidence).toBe(1);
  });
});
