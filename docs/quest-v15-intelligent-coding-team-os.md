# Quest v15 - Intelligent Coding Team OS

> Status: implemented in the v15 sidecar loop. This turns OpenAgent + Quest Mode
> from "one agent with tools" into a project-native coding team view built from
> verified repo context, temporal memory, and coding-intelligence sidecars.

## 1. Goal

OpenAgent should run a continuous coding-team loop:

```text
understand requirement -> understand project -> plan ownership -> simulate impact
  -> edit safely -> verify deeply -> learn from result -> suggest next steps
```

Quest v9-v14 already give OpenAgent strong coding context:

| Layer | Role |
| --- | --- |
| v9 Coding Intelligence | intent, impact, patch capsules, smart tests, review signals |
| v10 Coding Autopilot | symbol graph, pre-edit contract, patch ledger, review, failure replay |
| v11 Coding Execution | executable acceptance, drift guard, test gaps, runtime compatibility, security gate |
| v12 Verified Knowledgebase | evidence ledger, hallucination gate, contract facts, behavior oracle |
| v13 Semantic Repo Brain | AST-style repo facts, confidence labels, failure-fix memory, skill candidates |
| v14 Temporal Memory | chronic failures, patch outcomes, co-change/churn/ownership signals |

Quest v15 adds a deterministic team layer over those sidecars:

- requirement compiler
- expert team blackboard
- change impact simulator
- project skill-pack builder
- team completion gate

## 2. Implemented Module

The implemented module is:

```text
packages/cli/src/lib/quest-intelligent-coding-team.ts
```

It exports:

- `QUEST_INTELLIGENT_CODING_TEAM_VERSION = '15'`
- `buildQuestIntelligentCodingTeam`
- `writeQuestIntelligentCodingTeamArtifacts`
- `formatIntelligentCodingTeamSummary`

It is wired from `refreshQuestCodingIntelligence` after v10-v14 sidecars are
available, so v15 can consume coding autopilot, execution, verified knowledge,
semantic repo brain, temporal memory, repo wiki, events, git status, impact, and
test recommendations.

## 3. Artifacts

Each Quest or working-tree coding-intelligence refresh writes these v15 artifacts:

```text
intelligent-coding-team.json      # v15 rollup
requirement-compiler.json         # readiness, requirements, non-goals, acceptance, research gate
expert-team-blackboard.json       # roster, work items, shared context, file locks
change-impact-simulator.json      # predicted surfaces, dependency walk, risks, validation plan
project-skill-pack-builder.json   # approval-gated project playbook and skill candidates
intelligent-coding-team.md        # readable v15 brief
```

These artifacts are also listed in:

- `QuestRunArtifacts`
- Quest resume prompts
- runtime bridge prompts
- `oac quest-v9` output
- OpenAgent/OpenCode context
- Kimi and Codex adapters
- Kimi, OpenCode, and Codex smoke harnesses

## 4. Requirement Compiler

The implemented requirement compiler now has two stages:

1. A pre-planning compiler runs before task creation from the routed objective
   and router clarification signals.
2. The v15 sidecar compiler enriches the view after Quest artifacts exist.

The pre-planning output is attached to `ExecutionPlan.requirementCompiler`,
`plan.json`, `spec.json`, plan-level acceptance criteria, and per-task
acceptance criteria. This means vague or broad requests carry explicit
questions and assumptions before expert tasks are scheduled.

Key fields:

```ts
export interface QuestRequirementCompiler {
  version: '15'
  readiness: 'ready' | 'needs-clarification' | 'blocked'
  confidence: number
  objective: string
  requirements: QuestCompiledRequirement[]
  nonGoals: string[]
  acceptanceCriteria: string[]
  clarifyingQuestions: string[]
  researchGate: {
    needed: boolean
    reason: string
    queries: string[]
  }
}
```

Current behavior:

- runs a lightweight pre-planning requirement pass before `SwarmTask` creation
- feeds requirement-derived criteria into plan checks, task checks, `plan.json`,
  and `spec.json`
- marks readiness `blocked` if the Verified Knowledgebase hallucination gate or
  Semantic Repo Brain completion gate is blocked
- marks very broad objectives as `needs-clarification` when no file scope is
  known
- derives requirements from the objective, patch capsules, selected validation
  commands, and the no-hallucination constraint
- carries the v10 dependency research gate forward as the v15 research gate
- records non-goals such as no silent memory promotion and no unrelated edits

Future increment:

- promote the pre-planning assumption ledger into completion-time confirmation
- add deeper repo-backed requirement extraction from changed files, tests,
  schemas, and runtime prompts before scheduling

## 5. Expert Team Blackboard

The implemented blackboard is a deterministic coordination view, not a separate
mutable store.

Key fields:

```ts
export interface QuestExpertTeamBlackboard {
  version: '15'
  roster: QuestTeamExpert[]
  workItems: QuestTeamWorkItem[]
  sharedContext: {
    currentFiles: string[]
    affectedModules: string[]
    requiredSidecars: string[]
    openQuestions: string[]
  }
  fileLocks: Array<{ file: string; owner: ExpertRole; mode: 'read' | 'write'; reason: string }>
  coordinationRules: string[]
}
```

Current behavior:

- always includes team lead, architect, coder, reviewer, and test engineer
- conditionally adds security, devops, docs, and product roles based on files,
  runtime surfaces, security gates, and objective context
- maps patch capsules into work items with owner, dependency, files, and
  acceptance commands
- assigns file locks by likely owner to make write ownership visible
- exposes required v15 sidecars and open clarifying questions

Future increment:

- promote file locks from advisory sidecar state into scheduler-level enforcement
- add explicit handoff/blocker/review posts between roles
- let blackboard posts inject tasks into the live task DAG

## 6. Change Impact Simulator

The implemented simulator predicts the blast radius and validation surfaces
before completion.

Key fields:

```ts
export interface QuestChangeImpactSimulator {
  version: '15'
  blastRadius: 'low' | 'medium' | 'high'
  confidence: number
  predictedSurfaces: Array<{
    kind: 'file' | 'module' | 'test' | 'runtime' | 'docs' | 'schema' | 'command'
    name: string
    risk: 'low' | 'medium' | 'high'
    reason: string
    validation: string[]
  }>
  dependencyWalk: {
    directlyAffected: string[]
    transitivelyAffected: string[]
    coChangeNeighbors: Array<{ file: string; neighbors: string[] }>
  }
  riskScenarios: Array<{ id: string; title: string; severity: 'low' | 'medium' | 'high'; trigger: string; mitigation: string }>
  validationPlan: string[]
}
```

Current behavior:

- predicts file, module, test, runtime, docs, and schema surfaces
- combines static impact, recommended test commands, semantic runtime-prompt
  nodes, temporal co-change neighbors, execution runtime compatibility, and
  stale-knowledge refresh commands
- raises risk scenarios for high blast radius, runtime parity gaps, test gaps,
  and chronic failure commands

Future increment:

- add post-edit actual-vs-predicted deltas
- feed prediction accuracy back into temporal memory

## 7. Project Skill-Pack Builder

The implemented builder creates an approval-gated project playbook and skill
candidate queue.

Key fields:

```ts
export interface QuestProjectSkillPackBuilder {
  version: '15'
  candidates: QuestProjectSkillCandidate[]
  projectPlaybook: {
    stack: string[]
    commands: string[]
    conventions: string[]
    riskPolicies: string[]
  }
  approvalPolicy: string[]
}
```

Current behavior:

- carries v13 auto-skill-builder candidates forward
- infers project validation, runtime adapter parity, and repo coding convention
  playbook candidates
- keeps every inferred candidate `pending-user-approval`
- exposes approval commands such as `oac memory-promote --approve <name>`
- records stack, commands, conventions, and risk policies from the repo index
  and test recommendations

Future increment:

- persist an approved `.oac/memory/skill-pack.json`
- inject approved project playbooks into future requirement compilation

## 8. Team Gate

The team gate is the v15 completion checkpoint.

Checks:

- requirements compiled before coding
- expert team has active owners
- change impact is predicted before edits complete
- skill-promotion remains approval-gated

Verdict:

```ts
'pass' | 'review' | 'blocked'
```

Runtime prompts tell Kimi, OpenCode, Codex, and Claude to read the Intelligent
Coding Team OS sidecars before editing and before completion, and to use the
team gate as part of the done definition.

## 9. Validation

The v15 implementation is covered by:

- CLI typecheck
- CLI build
- focused Quest unit tests
- runtime bridge prompt tests
- shell syntax checks
- context-link validation
- registry validation
- Kimi Quest v8 smoke with v9-v16 sidecars
- forced live Kimi daemon validation
- OpenCode Quest v8 smoke with v9-v16 sidecars
- Codex Quest v8 CLI-path smoke with v9-v16 sidecars

## 10. Future Coding Improvements

Good next increments for the coding-team goal:

- deeper repo-backed requirement extraction before scheduling
- enforced scheduler file locks
- blackboard posts for handoffs, blockers, review requests, and task injection
- actual-vs-predicted impact deltas
- durable approved project skill pack
- self-improving test brain using temporal outcomes and flaky-test memory
- project memory timeline view over interaction memory, memory graph, repo wiki,
  temporal memory, and promotion candidates
