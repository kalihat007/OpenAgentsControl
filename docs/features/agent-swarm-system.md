# Controlled Agent Swarm System

OpenAgents Control swarm mode turns the existing context-first agent system into a dependency-aware multi-agent execution model.

## What Changed

OAC now has a formal swarm layer:

- `OpenAgent` as the single user-facing entrypoint for swarm planning and execution
- `SwarmOrchestrator` internal subagent for controlled swarm coordination
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
- TaskManager creates atomic tasks with dependencies.
- BatchExecutor runs only safe independent work in parallel.
- File write locks block same-file parallel edits.
- StageOrchestrator coordinates long architecture-to-release workflows.
- ProductManagerAgent, SystemArchitectAgent, and TechLeadAgent define scope, contracts, and arbitration before build work starts.
- BackendDeveloperAgent, OpenFrontendSpecialist, and OpenDevopsSpecialist own implementation slices after contracts are stable.
- SecurityAgent, TestEngineer, and CodeReviewer perform adversarial review independently.
- MergeCoordinatorAgent, IntegrationAgent, and DebugAgent handle convergence, validation, and recovery.
- Revenue swarms use ChiefGrowthOfficerAgent, MarketIntelligenceAgent, CustomerResearchAgent, BrandStrategyAgent, LeadGenerationAgent, ConversionAgent, PricingStrategyAgent, ContentSwarmAgent, PRCommunicationsAgent, TrustReputationAgent, PerformanceAnalyticsAgent, PredictiveRevenueAgent, and SalesCoachAgent for GTM execution.
- Investor magnet swarms use InvestorNarrativeAgent, FundingRoundSimulationAgent, PRMediaEngineAgent, LinkedInThoughtLeadershipAgent, EventConferenceAgent, AnalystRelationsAgent, SocialProofValidationAgent, CrisisOpportunityAgent, and InvestorMetricsAgent for fundraising momentum.
- Business operating swarms use CEOAgent plus support, product strategy, regulatory/compliance, talent, finance, supply chain, innovation/R&D, crisis response, partnership, and knowledge management swarm agents.
- Technical swarms use HardwareArchitectAgent, FPGAASICAgent, RTOSOSAgent, EmbeddedCPPCodingAgent, AutomotiveEthernetAgent, SecurityFirmwareAgent, TechnicalPythonToolingAgent, EmbeddedRustAgent, HILSILAgent, PenetrationTestAgent, TechnicalComplianceVVAgent, EMCEnvironmentalAgent, TechnicalCICDAgent, and TechnicalReleaseAgent for HackersEra-style cybersecurity R&D.
- Test, build, review, and documentation gates happen before completion.

## Runtime Model

```text
User request
  -> OpenAgent
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
