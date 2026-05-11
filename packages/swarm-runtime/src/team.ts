import type { SwarmRole } from "./types.js";

export interface TeamRoleDefinition {
  role: SwarmRole;
  agent: string;
  responsibility: string;
  defaultPhase:
    | "discovery"
    | "architecture"
    | "implementation"
    | "review"
    | "integration"
    | "recovery";
}

export const DEVELOPMENT_SWARM_TEAM: TeamRoleDefinition[] = [
  {
    role: "product-manager",
    agent: "ProductManagerAgent",
    responsibility: "requirements, stories, scope, acceptance criteria",
    defaultPhase: "discovery",
  },
  {
    role: "system-architect",
    agent: "SystemArchitectAgent",
    responsibility: "data models, API contracts, service boundaries",
    defaultPhase: "architecture",
  },
  {
    role: "tech-lead",
    agent: "TechLeadAgent",
    responsibility: "stack decisions, repo patterns, arbitration",
    defaultPhase: "architecture",
  },
  {
    role: "frontend-developer",
    agent: "OpenFrontendSpecialist",
    responsibility: "UI components, state, frontend integration",
    defaultPhase: "implementation",
  },
  {
    role: "backend-developer",
    agent: "BackendDeveloperAgent",
    responsibility: "APIs, services, business logic, database queries",
    defaultPhase: "implementation",
  },
  {
    role: "devops",
    agent: "OpenDevopsSpecialist",
    responsibility: "Docker, CI/CD, IaC, deployment automation",
    defaultPhase: "implementation",
  },
  {
    role: "qa",
    agent: "TestEngineer",
    responsibility: "unit, integration, E2E, and acceptance tests",
    defaultPhase: "review",
  },
  {
    role: "security",
    agent: "SecurityAgent",
    responsibility: "auth, secrets, dependency, injection, and tenant-boundary review",
    defaultPhase: "review",
  },
  {
    role: "code-review",
    agent: "CodeReviewer",
    responsibility: "bug, maintainability, and standards review",
    defaultPhase: "review",
  },
  {
    role: "documentation",
    agent: "DocWriter",
    responsibility: "README, API docs, runbooks, and behavior docs",
    defaultPhase: "review",
  },
  {
    role: "merge-coordinator",
    agent: "MergeCoordinatorAgent",
    responsibility: "merge conflicts, module ownership, contract convergence",
    defaultPhase: "integration",
  },
  {
    role: "integration",
    agent: "IntegrationAgent",
    responsibility: "system wiring, smoke tests, validation gates",
    defaultPhase: "integration",
  },
  {
    role: "debug",
    agent: "DebugAgent",
    responsibility: "root-cause isolation and recovery task shaping",
    defaultPhase: "recovery",
  },
];

export const REVENUE_SWARM_TEAM: TeamRoleDefinition[] = [
  {
    role: "chief-growth-officer",
    agent: "ChiefGrowthOfficerAgent",
    responsibility: "KPIs, channel allocation, budget logic, arbitration",
    defaultPhase: "discovery",
  },
  {
    role: "market-intelligence",
    agent: "MarketIntelligenceAgent",
    responsibility: "competitors, trends, whitespace, trigger events",
    defaultPhase: "discovery",
  },
  {
    role: "customer-research",
    agent: "CustomerResearchAgent",
    responsibility: "ICP, personas, pain points, JTBD, objections",
    defaultPhase: "discovery",
  },
  {
    role: "brand-strategy",
    agent: "BrandStrategyAgent",
    responsibility: "positioning, proof pillars, brand voice, claims",
    defaultPhase: "architecture",
  },
  {
    role: "lead-generation",
    agent: "LeadGenerationAgent",
    responsibility: "prospecting, outbound, qualification, routing",
    defaultPhase: "implementation",
  },
  {
    role: "conversion",
    agent: "ConversionAgent",
    responsibility: "landing pages, funnels, A/B tests, offers",
    defaultPhase: "implementation",
  },
  {
    role: "pricing-strategy",
    agent: "PricingStrategyAgent",
    responsibility: "packaging, discount rules, pilot-to-production ladder",
    defaultPhase: "architecture",
  },
  {
    role: "content-swarm",
    agent: "ContentSwarmAgent",
    responsibility: "campaign asset briefs, content matrix, channel variants",
    defaultPhase: "implementation",
  },
  {
    role: "social-media",
    agent: "SocialMediaAgent",
    responsibility: "community, LinkedIn, trends, influencer mapping",
    defaultPhase: "implementation",
  },
  {
    role: "pr-communications",
    agent: "PRCommunicationsAgent",
    responsibility: "PR, bylines, crisis response, event placement",
    defaultPhase: "implementation",
  },
  {
    role: "customer-success",
    agent: "CustomerSuccessAgent",
    responsibility: "onboarding, health scoring, expansion, renewal",
    defaultPhase: "integration",
  },
  {
    role: "trust-reputation",
    agent: "TrustReputationAgent",
    responsibility: "reviews, testimonials, references, reputation defense",
    defaultPhase: "review",
  },
  {
    role: "performance-analytics",
    agent: "PerformanceAnalyticsAgent",
    responsibility: "dashboards, attribution, funnel/cohort analysis",
    defaultPhase: "review",
  },
  {
    role: "predictive-revenue",
    agent: "PredictiveRevenueAgent",
    responsibility: "churn, LTV, next-best-action, forecasts",
    defaultPhase: "review",
  },
  {
    role: "sales-coach",
    agent: "SalesCoachAgent",
    responsibility: "adversarial buyer simulation and objection coaching",
    defaultPhase: "review",
  },
];

export const BUSINESS_OPERATIONS_SWARM_TEAM: TeamRoleDefinition[] = [
  {
    role: "ceo",
    agent: "CEOAgent",
    responsibility: "cross-swarm synthesis, OKRs, resource conflicts, scenario planning",
    defaultPhase: "discovery",
  },
  {
    role: "customer-support-success",
    agent: "CustomerSupportSuccessSwarmAgent",
    responsibility: "support triage, technical escalation, customer health, expansion, VOC",
    defaultPhase: "implementation",
  },
  {
    role: "product-strategy",
    agent: "ProductStrategySwarmAgent",
    responsibility: "market sizing, roadmap, competitive intel, partnerships, sunset analysis",
    defaultPhase: "architecture",
  },
  {
    role: "regulatory-compliance",
    agent: "RegulatoryComplianceSwarmAgent",
    responsibility: "standards monitoring, compliance gaps, certification evidence, RFP readiness",
    defaultPhase: "review",
  },
  {
    role: "talent-hiring",
    agent: "TalentHiringSwarmAgent",
    responsibility: "sourcing, screening, culture fit, compensation, onboarding",
    defaultPhase: "implementation",
  },
  {
    role: "finance-investor-relations",
    agent: "FinanceInvestorRelationsSwarmAgent",
    responsibility: "FP&A, unit economics, investor narrative, due diligence",
    defaultPhase: "review",
  },
  {
    role: "supply-chain-manufacturing",
    agent: "SupplyChainManufacturingSwarmAgent",
    responsibility: "components, BOM, vendors, quality, logistics",
    defaultPhase: "implementation",
  },
  {
    role: "innovation-rd",
    agent: "InnovationRDSwarmAgent",
    responsibility: "technology scouting, prototypes, patents, academic partnerships",
    defaultPhase: "architecture",
  },
  {
    role: "crisis-response",
    agent: "CrisisResponseSwarmAgent",
    responsibility: "incident detection, impact assessment, response coordination, legal, reputation",
    defaultPhase: "recovery",
  },
  {
    role: "partnership-ecosystem",
    agent: "PartnershipEcosystemSwarmAgent",
    responsibility: "partner mapping, co-marketing, alliances, sponsorship, channels",
    defaultPhase: "integration",
  },
  {
    role: "knowledge-management",
    agent: "KnowledgeManagementSwarmAgent",
    responsibility: "document harvesting, living wikis, training, expert location, decay detection",
    defaultPhase: "review",
  },
];

export const TECHNICAL_SWARM_TEAM: TeamRoleDefinition[] = [
  {
    role: "hardware-architect",
    agent: "HardwareArchitectAgent",
    responsibility: "schematics, PCB, SI/PI, EMC, DFM/DFT, power, connectors",
    defaultPhase: "architecture",
  },
  {
    role: "fpga-asic",
    agent: "FPGAASICAgent",
    responsibility: "HDL, bridges, DMA, timestamping, timing closure, formal checks",
    defaultPhase: "implementation",
  },
  {
    role: "rtos-os",
    agent: "RTOSOSAgent",
    responsibility: "AUTOSAR, FreeRTOS, QNX, Linux BSP, Yocto, scheduling",
    defaultPhase: "architecture",
  },
  {
    role: "embedded-cpp",
    agent: "EmbeddedCPPCodingAgent",
    responsibility: "drivers, stacks, MCAL-like modules, MISRA/AUTOSAR-aligned firmware",
    defaultPhase: "implementation",
  },
  {
    role: "automotive-ethernet",
    agent: "AutomotiveEthernetAgent",
    responsibility: "100/1000BASE-T1, TSN, SOME/IP, DDS, capture and injection",
    defaultPhase: "implementation",
  },
  {
    role: "security-firmware",
    agent: "SecurityFirmwareAgent",
    responsibility: "secure boot, HSM/TPM, crypto, provisioning, anti-tamper",
    defaultPhase: "implementation",
  },
  {
    role: "technical-python-tooling",
    agent: "TechnicalPythonToolingAgent",
    responsibility: "host tooling, test automation, data analysis, and reports",
    defaultPhase: "implementation",
  },
  {
    role: "embedded-rust",
    agent: "EmbeddedRustAgent",
    responsibility: "memory-safe parsers, no_std modules, and fuzzable protocol code",
    defaultPhase: "implementation",
  },
  {
    role: "hil-sil",
    agent: "HILSILAgent",
    responsibility: "HIL/SIL benches, CANoe, vTESTstudio, dSPACE, Vector, NI validation",
    defaultPhase: "review",
  },
  {
    role: "penetration-test",
    agent: "PenetrationTestAgent",
    responsibility: "fuzzing, reverse engineering, side-channel, fault injection, wireless, physical, network tests",
    defaultPhase: "review",
  },
  {
    role: "technical-compliance-vv",
    agent: "TechnicalComplianceVVAgent",
    responsibility: "ISO/SAE 21434, UN R155, EVITA/HEAVENS, TARA, traceability, evidence",
    defaultPhase: "review",
  },
  {
    role: "emc-environmental",
    agent: "EMCEnvironmentalAgent",
    responsibility: "CISPR 25, ISO 11452, ISO 7637, ESD, thermal, vibration pre-checks",
    defaultPhase: "review",
  },
  {
    role: "technical-cicd",
    agent: "TechnicalCICDAgent",
    responsibility: "Yocto, container toolchains, HDL/software CI, reproducible builds, artifact signing",
    defaultPhase: "integration",
  },
  {
    role: "technical-release",
    agent: "TechnicalReleaseAgent",
    responsibility: "SBOM, CVE/license scans, OTA packaging, release notes, advisories",
    defaultPhase: "integration",
  },
];

export const INVESTOR_MAGNET_SWARM_TEAM: TeamRoleDefinition[] = [
  {
    role: "investor-narrative",
    agent: "InvestorNarrativeAgent",
    responsibility: "market narrative, traction story, competitive positioning, exits, data-room needs",
    defaultPhase: "architecture",
  },
  {
    role: "funding-round-simulation",
    agent: "FundingRoundSimulationAgent",
    responsibility: "VC personas, skeptical questions, rebuttal matrix, fundraising assets",
    defaultPhase: "review",
  },
  {
    role: "investor-pr-media",
    agent: "PRMediaEngineAgent",
    responsibility: "media targets, news-cycle orchestration, embargoes, expert commentary, investor follow-up",
    defaultPhase: "implementation",
  },
  {
    role: "linkedin-thought-leadership",
    agent: "LinkedInThoughtLeadershipAgent",
    responsibility: "founder, CTO, product, engineering, customer, advisor, comment, clip, and news-jacking programs",
    defaultPhase: "implementation",
  },
  {
    role: "event-conference",
    agent: "EventConferenceAgent",
    responsibility: "CFPs, demos, VIP dinners, awards, event-led investor credibility",
    defaultPhase: "implementation",
  },
  {
    role: "analyst-relations",
    agent: "AnalystRelationsAgent",
    responsibility: "Gartner, Forrester, IDC, awards, custom research, category positioning",
    defaultPhase: "architecture",
  },
  {
    role: "social-proof-validation",
    agent: "SocialProofValidationAgent",
    responsibility: "logos, testimonials, partner proof, advisors, universities, permission gates",
    defaultPhase: "review",
  },
  {
    role: "crisis-opportunity",
    agent: "CrisisOpportunityAgent",
    responsibility: "incident monitoring, rapid expert response, media offers, customer checks, investor memos",
    defaultPhase: "recovery",
  },
  {
    role: "investor-metrics",
    agent: "InvestorMetricsAgent",
    responsibility: "market, traction, efficiency, product, team, moat, buzz metrics and evidence freshness",
    defaultPhase: "review",
  },
];

export function agentForRole(role: SwarmRole): string | undefined {
  return [
    ...DEVELOPMENT_SWARM_TEAM,
    ...REVENUE_SWARM_TEAM,
    ...BUSINESS_OPERATIONS_SWARM_TEAM,
    ...TECHNICAL_SWARM_TEAM,
    ...INVESTOR_MAGNET_SWARM_TEAM,
  ].find((definition) => definition.role === role)?.agent;
}
