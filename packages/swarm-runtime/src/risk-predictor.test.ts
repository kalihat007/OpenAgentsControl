import { describe, it, expect } from "bun:test"
import { predictBatchRisk, scoreToLevel } from "./risk-predictor.js"
import type { SwarmTask } from "./types.js"
import type {
  RiskPredictorCodebaseIndex,
  RiskPredictorTeamMemory,
  RiskPredictorQuestPattern,
} from "./risk-predictor.js"

function makeTask(overrides: Partial<SwarmTask> = {}): SwarmTask {
  return {
    id: "t1",
    title: "Refactor auth module",
    agent: "backend-developer",
    status: "pending",
    dependsOn: [],
    acceptanceCriteria: [],
    reads: ["src/auth.ts"],
    writes: [],
    ...overrides,
  } as SwarmTask
}

function makeCodebase(): RiskPredictorCodebaseIndex {
  return {
    modules: [
      {
        path: "src/auth.ts",
        imports: ["src/db.ts", "src/cache.ts", "src/logger.ts", "src/metrics.ts", "src/config.ts"],
        exports: ["login", "logout", "refresh"],
        complexity: "high",
      },
      {
        path: "src/utils.ts",
        imports: [],
        exports: ["helper"],
        complexity: "low",
      },
    ],
    dependencies: {
      "src/auth.ts": { imports: ["src/db.ts"], importedBy: ["src/api.ts", "src/app.ts", "src/routes.ts", "src/middleware.ts", "src/tests.ts"] },
      "src/utils.ts": { imports: [], importedBy: [] },
    },
    conventions: {
      importStyle: "named",
      fileNaming: "kebab-case",
    },
  }
}

function makeTeamMemory(): RiskPredictorTeamMemory {
  return {
    recurringFailures: [
      {
        pattern: "auth refactor",
        failureSummary: "Auth refactors often break session handling",
        occurrenceCount: 5,
        resolved: false,
      },
    ],
  }
}

function makePatterns(): RiskPredictorQuestPattern[] {
  return [
    {
      objectiveKeywords: ["refactor", "auth", "module"],
      outcome: "failed",
    },
    {
      objectiveKeywords: ["refactor", "auth", "module"],
      outcome: "success",
    },
  ]
}

describe("predictBatchRisk", () => {
  it("returns low risk for simple task with no history", () => {
    const task = makeTask({ reads: ["src/utils.ts"] })
    const report = predictBatchRisk([task])
    expect(report.overallLevel).toBe("low")
    expect(report.recommendations[0]).toContain("Risk profile is clean")
  })

  it("detects high dependency risk for high-fan-out module", () => {
    const task = makeTask({ reads: ["src/auth.ts"] })
    const report = predictBatchRisk([task], { codebase: makeCodebase() })
    const taskRisk = report.taskRisks[0]
    expect(taskRisk.factors.some((f) => f.category === "dependency")).toBe(true)
    expect(taskRisk.score).toBeGreaterThan(0)
  })

  it("detects historical risk from recurring failures", () => {
    const task = makeTask({ title: "Refactor auth module" })
    const report = predictBatchRisk([task], {
      teamMemory: makeTeamMemory(),
      patterns: [],
    })
    const taskRisk = report.taskRisks[0]
    expect(taskRisk.factors.some((f) => f.category === "history")).toBe(true)
  })

  it("detects historical risk from past failed patterns", () => {
    const task = makeTask({ title: "Refactor auth module" })
    const report = predictBatchRisk([task], {
      patterns: makePatterns(),
    })
    const taskRisk = report.taskRisks[0]
    expect(taskRisk.factors.some((f) => f.category === "history")).toBe(true)
  })

  it("detects conflict risk for overlapping concurrent tasks", () => {
    const t1 = makeTask({ id: "t1", reads: ["src/auth.ts"], writes: ["src/db.ts"] })
    const t2 = makeTask({ id: "t2", reads: ["src/auth.ts"], writes: ["src/cache.ts"] })
    const report = predictBatchRisk([t1, t2])
    expect(report.taskRisks[0].factors.some((f) => f.category === "conflict")).toBe(true)
    expect(report.recommendations.some((r) => r.includes("overlap"))).toBe(true)
  })

  it("detects complexity risk for many affected files", () => {
    const task = makeTask({
      reads: ["src/a.ts", "src/b.ts", "src/c.ts"],
      writes: ["src/d.ts", "src/e.ts", "src/f.ts"],
    })
    const report = predictBatchRisk([task])
    const taskRisk = report.taskRisks[0]
    expect(taskRisk.factors.some((f) => f.category === "complexity")).toBe(true)
  })

  it("recommends review gate for high overall risk", () => {
    const task = makeTask({
      title: "Refactor auth module",
      reads: ["src/auth.ts"],
      writes: ["src/auth.ts"],
    })
    const report = predictBatchRisk([task], {
      codebase: makeCodebase(),
      teamMemory: makeTeamMemory(),
      patterns: makePatterns(),
    })
    expect(report.overallLevel).toBeOneOf(["high", "critical"])
    expect(report.recommendations.some((r) => r.includes("REVIEW gate"))).toBe(true)
  })

  it("produces stable scores for identical inputs", () => {
    const task = makeTask()
    const r1 = predictBatchRisk([task], { codebase: makeCodebase() })
    const r2 = predictBatchRisk([task], { codebase: makeCodebase() })
    expect(r1.overallScore).toBe(r2.overallScore)
  })

  it("includes top factors sorted by weight", () => {
    const task = makeTask({
      title: "Refactor auth module",
      reads: ["src/auth.ts"],
      writes: ["src/auth.ts"],
    })
    const report = predictBatchRisk([task], {
      codebase: makeCodebase(),
      teamMemory: makeTeamMemory(),
      patterns: makePatterns(),
    })
    expect(report.topFactors.length).toBeGreaterThan(0)
    // Verify sorted by weight descending
    for (let i = 1; i < report.topFactors.length; i++) {
      expect(report.topFactors[i - 1].weight).toBeGreaterThanOrEqual(report.topFactors[i].weight)
    }
  })
})

describe("scoreToLevel", () => {
  it("maps scores to correct levels", () => {
    expect(scoreToLevel(0)).toBe("low")
    expect(scoreToLevel(2)).toBe("low")
    expect(scoreToLevel(3)).toBe("low")
    expect(scoreToLevel(5)).toBe("medium")
    expect(scoreToLevel(6)).toBe("medium")
    expect(scoreToLevel(7)).toBe("high")
    expect(scoreToLevel(8)).toBe("high")
    expect(scoreToLevel(9)).toBe("critical")
    expect(scoreToLevel(10)).toBe("critical")
  })
})
