<!-- Context: core/business-operations-swarms | Priority: critical | Version: 1.0 | Updated: 2026-05-11 -->

# Business Operations Swarms

Business operations swarms let OpenAgent act as a company operating system for deep-tech cybersecurity businesses. These swarms complement development and revenue swarms.

For the user's product direction, assume HackersEra-style cybersecurity or cybersecurity-testing solutions unless explicitly told otherwise.

## Meta-Swarm

| Swarm | Agent | Purpose |
|-------|-------|---------|
| CEO Meta-Swarm | CEOAgent | cross-swarm synthesis, OKRs, resource conflicts, scenarios |
| Investor Magnet | InvestorNarrativeAgent / FundingRoundSimulationAgent | funding narrative, investor momentum, social proof, analyst/media credibility |
| Customer Support & Success | CustomerSupportSuccessSwarmAgent | ticket triage, technical escalation, health, expansion, VOC |
| Product Management & Strategy | ProductStrategySwarmAgent | market sizing, roadmap, partnerships, sunset analysis |
| Regulatory & Compliance | RegulatoryComplianceSwarmAgent | standards monitoring (ISO 21434, ISO 24089, UN R155, UN R156, EU RED, WP.29), gap analysis, certification evidence |
| Talent & Hiring | TalentHiringSwarmAgent | sourcing, screening, comp, onboarding |
| Finance & Investor Relations | FinanceInvestorRelationsSwarmAgent | forecasts, unit economics, investor narrative, data room |
| Supply Chain & Manufacturing | SupplyChainManufacturingSwarmAgent | components, BOM, vendors, quality, logistics |
| Innovation & R&D | InnovationRDSwarmAgent | tech scouting, prototypes, patents, academic partners |
| Crisis Response | CrisisResponseSwarmAgent | incident detection, impact, comms, legal, reputation |
| Partnership & Ecosystem | PartnershipEcosystemSwarmAgent | partner map, co-marketing, technical alliances, channel |
| Knowledge Management | KnowledgeManagementSwarmAgent | harvesting, living wikis, training, expert map, doc decay |

## Priority Matrix

| Swarm | Urgency | Business Impact | Default Build Effort |
|-------|---------|-----------------|----------------------|
| Customer Support & Success | critical | retention and expansion | low |
| Regulatory & Compliance | critical | risk avoidance and RFP win rate | medium |
| Product Management & Strategy | high | portfolio focus and roadmap quality | medium |
| Finance & Investor Relations | high | fundraising and unit economics | low |
| Investor Magnet | high | investor momentum and category credibility | medium |
| Supply Chain & Manufacturing | high | hardware margin and availability | medium |
| Crisis Response | medium | reputation protection | low |
| Partnership & Ecosystem | medium | ecosystem credibility and channel growth | medium |
| Knowledge Management | medium | operational leverage and onboarding | low |
| Talent & Hiring | medium | growth capacity | medium |
| Innovation & R&D | medium | long-term differentiation | high |

## Cross-Swarm Signal Examples

- Sales asks for CAN XL → ProductStrategy checks roadmap → Innovation checks protocol trends → Regulatory checks standards timing.
- Support sees GMSL setup failures → Knowledge creates runbook → Product prioritizes UX fix → CustomerSuccess flags accounts at risk.
- Supply chain flags FPGA lead-time risk → Finance updates margin forecast → ProductStrategy evaluates alternate hardware path.
- Crisis detects customer incident → Compliance checks disclosure → PR/revenue handles trust messaging → Engineering creates patch plan.
- Funding round starts → InvestorNarrative shapes thesis → PR/LinkedIn builds momentum → Finance validates metrics → SocialProof checks permissions → CEO locks story.
- Engineering releases OTA update → TechnicalComplianceVVAgent verifies ISO 24089 compliance → RegulatoryComplianceSwarmAgent updates SUMS evidence → ProductStrategy updates roadmap → CustomerSupportSuccessSwarmAgent prepares comms.

## Required Artifacts

```text
.tmp/operations/{session-id}/
  ceo-brief.json
  signal-map.json
  swarm-reports/
  okrs.json
  decisions.jsonl
  risk-register.json
  scenario-plans.json
```

## Completion Standard

An operating swarm is complete only when:

- the signal source is clear
- responsible swarm agents are named
- recommended decision or action is explicit
- risks, dependencies, and metrics are listed
- CEOAgent has a synthesis path for cross-swarm conflicts
