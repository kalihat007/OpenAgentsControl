# Controlled Agent Swarm System

OpenAgents Control swarm mode turns the existing context-first agent system into a dependency-aware, scale-out organizational AI model.

## What Changed

OAC now has a formal swarm layer:

- `OpenAgent` as the single user-facing entrypoint for swarm planning and execution
- `core/experts-mode.md` default OpenAgent Team Lead workflow powered by agent swarm orchestration for medium-to-large tasks with dynamic experts, task progress, validation, review, and self-evolution
- `SwarmOrchestrator` internal subagent for controlled swarm coordination
- `core/hackersera-master-swarm.md` default OpenAgent routing standard for Trusted Fast Mode and HackersEra cybersecurity product/company workflows
- `/swarm-plan`, `/swarm-run`, and `/swarm-status` commands
- `/swarm-team` and `/swarm-debug` commands for self-organizing engineering teams and incident recovery
- `core/swarm-orchestration.md` context standard
- `core/development-swarm.md` engineering-team role and execution-pattern standard
- `core/revenue-swarm.md` revenue-growth agency role and GTM execution-pattern standard
- `core/investor-magnet-swarm.md` investor magnet standard for narrative, funding simulation, PR/media, LinkedIn thought leadership, analyst relations, events, social proof, crisis-to-opportunity, and investor metrics
- `core/business-operations-swarms.md` business operating swarm standard for CEO synthesis, support, product strategy, compliance, talent, finance, supply chain, R&D, crisis, partnerships, and knowledge management
- `core/technical-swarm.md` deep-tech R&D standard for hardware/software co-design, embedded, FPGA/ASIC, HIL/SIL, VAPT, compliance, EMC, SBOM, signing, and release evidence
- `@nextsystems/oac-swarm-runtime` TypeScript package for task graph scheduling, file-lock conflict checks, and session/event records

## Design Principles

Swarm mode is powerful because it is constrained:

- ContextScout discovers project reality before any plan.
- OpenAgent runs in Trusted Fast Mode: safe local work executes directly, while destructive, credential, production, legal/payment, public external, and irreversible data actions require approval.
- OpenAgent uses Experts Mode by default; for medium-to-large tasks, TeamLeadAgent plans, assembles experts, creates the swarm task graph, tracks progress, integrates output, and validates results.
- HackersEra Master Swarm is the default cross-functional router for cybersecurity product, technical, revenue, investor, operations, support, compliance, and CEO requests.
- OpenAgent uses scale-out organizational AI: it self-organizes the needed team, assigns roles dynamically, and distributes cognitive load across specialists.
- Large deployments may target up to 100 subagents and hundreds to 1,500+ tool calls when task boundaries, runtime support, and validation capacity allow.
- Long-horizon context is kept in source trails, task graphs, module claims, contracts, incidents, checkpoints, artifacts, and evidence reports instead of relying only on compressed summaries.
- Structural disagreement is required for important decisions: independent agents can disagree, then TechLeadAgent, CEOAgent, or the relevant arbiter reconciles the result.
- TaskManager creates atomic tasks with dependencies.
- BatchExecutor runs only safe independent work in parallel.
- File write locks block same-file parallel edits.
- StageOrchestrator coordinates long architecture-to-release workflows.
- ProductManagerAgent, SystemArchitectAgent, and TechLeadAgent define scope, contracts, and arbitration before build work starts.
- Experts Mode uses FrontendExpert, BackendExpert, QAExpert, CodeReviewExpert, ResearchExpert, DevOpsExpert, and UXDesigner as the default engineering team, adding domain experts only when needed.
- BackendDeveloperAgent, OpenFrontendSpecialist, and OpenDevopsSpecialist own implementation slices after contracts are stable.
- SecurityAgent, TestEngineer, and CodeReviewer perform adversarial review independently.
- MergeCoordinatorAgent, IntegrationAgent, and DebugAgent handle convergence, validation, and recovery.
- Revenue swarms use ChiefGrowthOfficerAgent, MarketIntelligenceAgent, CustomerResearchAgent, BrandStrategyAgent, LeadGenerationAgent, ConversionAgent, PricingStrategyAgent, ContentSwarmAgent, PRCommunicationsAgent, TrustReputationAgent, PerformanceAnalyticsAgent, PredictiveRevenueAgent, and SalesCoachAgent for GTM execution.
- Investor magnet swarms use InvestorNarrativeAgent, FundingRoundSimulationAgent, PRMediaEngineAgent, LinkedInThoughtLeadershipAgent, EventConferenceAgent, AnalystRelationsAgent, SocialProofValidationAgent, CrisisOpportunityAgent, and InvestorMetricsAgent for fundraising momentum.
- Business operating swarms use CEOAgent plus support, product strategy, regulatory/compliance, talent, finance, supply chain, innovation/R&D, crisis response, partnership, and knowledge management swarm agents.
- Technical swarms use HardwareArchitectAgent, FPGAASICAgent, RTOSOSAgent, EmbeddedCPPCodingAgent, AutomotiveEthernetAgent, SecurityFirmwareAgent, TechnicalPythonToolingAgent, EmbeddedRustAgent, HILSILAgent, PenetrationTestAgent, TechnicalComplianceVVAgent, EMCEnvironmentalAgent, TechnicalCICDAgent, and TechnicalReleaseAgent for HackersEra-style cybersecurity R&D.
- Test, build, review, and documentation gates happen before completion.

## Core Architecture Capabilities

| Capability | OpenAgent Default |
|------------|-------------------|
| Self-organization | Auto-hires researchers, analysts, fact-checkers, builders, reviewers, and specialists with defined roles. |
| Dynamic role assignment | CEO-like routing finds the right specialists for the task instead of requiring human micromanagement. |
| Parallel execution | Runs independent discovery, implementation, review, test, documentation, and synthesis tracks in parallel. |
| Massive tool orchestration | Coordinates large tool-call budgets for repo search, current docs, builds, tests, scanners, evidence, and publishing flows. |
| Speed advantage | Scales out horizontally so safe parallel work can finish materially faster than sequential single-agent execution. |
| Lossless context management | Stores decisions, contracts, incidents, checkpoints, artifacts, and evidence outside a single shrinking prompt. |
| Structural disagreement | Forces adversarial perspectives and reconciliation to reduce groupthink. |
| On-demand expertise | Instantly creates domain specialists for cybersecurity, automotive, embedded, firmware, Go, Node, compliance, GTM, investor, and operations work. |

## Execution Patterns

| Pattern | What It Does |
|---------|--------------|
| Discovery at scale | Parallel searching, downloading, categorizing, summarizing, compatibility checks, and evidence mapping. |
| Output at scale | Consumes massive document sets and coordinates expert personas for long-form production, code, tests, proposals, and reports. |
| Perspective at scale | Deploys contradictory viewpoints simultaneously for adversarial analysis. |
| Creative variation | Produces many independent options before selection, merge, or stress-test. |
| Long-horizon synthesis | Combines outputs from many investigations while preserving caveats and validation state. |

## Current Boundaries

| Limitation | Status |
|------------|--------|
| Direct subagent-to-subagent communication | Planned architecture direction; current coordination flows through OpenAgent, task graphs, session files, artifacts, and summaries. |
| Dynamic control of parallel width | Bounded by runtime/tool support, task independence, file ownership safety, and validation capacity. |
| Architecture hardening | Ongoing; completion reports should separate proven validation from operating targets. |

## Runtime Model

```text
User request
  -> OpenAgent
  -> Experts Mode by default
  -> Agent swarm task graph when medium/large work
  -> HackersEra Master Swarm when cybersecurity/HackersEra/cross-functional
  -> SwarmOrchestrator
  -> ProductManagerAgent / SystemArchitectAgent / TechLeadAgent
  -> ContextScout / ExternalScout
  -> contracts + task graph + module claims
  -> dependency batches
  -> BatchExecutor + workers
  -> adversarial QA/Security/Review
  -> MergeCoordinatorAgent
  -> integration
  -> DebugAgent if validation fails
  -> test/build/review/doc gates
  -> final report
```

## Session Layout

```text
.tmp/swarm/{session-id}/
  swarm.json
  task-graph.json
  module-claims.json
  contracts.json
  incidents.jsonl
  checkpoints.jsonl
  events.jsonl
  artifacts/
  reports/
```

## When To Use Swarm Mode

Use swarm mode for:

- multi-file features
- architecture plus implementation work
- Qoder-style Experts Mode requests with Team Lead planning, parallel experts, task progress, browser verification, custom experts, or self-evolution
- parallel-safe module creation
- test, review, docs, and build pipelines
- migrations where sequencing matters
- large refactors with isolated file ownership
- SaaS/module/platform builds that need product, architecture, implementation, review, integration, and deployment roles
- cybersecurity GTM campaigns, enterprise sales plays, trust/reputation programs, pricing/packaging work, and revenue analytics
- investor narrative, funding round preparation, PR launches, founder/CTO LinkedIn leadership, analyst relations, event momentum, social proof, and investor-ready metrics
- customer support, compliance, product portfolio, finance, hardware supply chain, R&D, hiring, crisis response, partnerships, and knowledge management decisions
- cybersecurity hardware/software products, embedded firmware, FPGA/ASIC work, automotive protocol tooling, VAPT campaigns, HIL/SIL validation, continuous TARA, SBOM/signing, and OTA release readiness

Do not use swarm mode for:

- one-file edits
- simple explanations
- tasks with unclear scope
- risky changes where the write set cannot be predicted

## Safety Contract

A task can enter a parallel batch only if:

- all dependencies are complete
- no task in the batch writes the same file
- no task violates module ownership claims
- read/write overlap is accepted or absent
- each worker has clear acceptance criteria
- validation gates are defined before execution

This keeps OAC fast without turning it reckless.
