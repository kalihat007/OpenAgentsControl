import { describe, test, expect } from "bun:test";
import {
  agentForRole,
  DEVELOPMENT_SWARM_TEAM,
  REVENUE_SWARM_TEAM,
  BUSINESS_OPERATIONS_SWARM_TEAM,
  TECHNICAL_SWARM_TEAM,
  INVESTOR_MAGNET_SWARM_TEAM,
  type TeamRoleDefinition,
} from "./team.js";
import type { SwarmRole } from "./types.js";

// ── Team definition structure ────────────────────────────────────────────────

function validateTeam(name: string, team: TeamRoleDefinition[]) {
  describe(`${name} structure`, () => {
    test("has at least one member", () => {
      expect(team.length).toBeGreaterThan(0);
    });

    test("every member has a role, agent, responsibility, and defaultPhase", () => {
      for (const member of team) {
        expect(member.role).toBeTruthy();
        expect(member.agent).toBeTruthy();
        expect(member.responsibility).toBeTruthy();
        expect(member.defaultPhase).toBeTruthy();
      }
    });

    test("no duplicate roles within the team", () => {
      const roles = team.map((m) => m.role);
      expect(new Set(roles).size).toBe(roles.length);
    });

    test("no duplicate agents within the team", () => {
      const agents = team.map((m) => m.agent);
      expect(new Set(agents).size).toBe(agents.length);
    });

    test("all defaultPhase values are valid", () => {
      const validPhases = [
        "discovery",
        "architecture",
        "implementation",
        "review",
        "integration",
        "recovery",
      ];
      for (const member of team) {
        expect(validPhases).toContain(member.defaultPhase);
      }
    });
  });
}

validateTeam("DEVELOPMENT_SWARM_TEAM", DEVELOPMENT_SWARM_TEAM);
validateTeam("REVENUE_SWARM_TEAM", REVENUE_SWARM_TEAM);
validateTeam("BUSINESS_OPERATIONS_SWARM_TEAM", BUSINESS_OPERATIONS_SWARM_TEAM);
validateTeam("TECHNICAL_SWARM_TEAM", TECHNICAL_SWARM_TEAM);
validateTeam("INVESTOR_MAGNET_SWARM_TEAM", INVESTOR_MAGNET_SWARM_TEAM);

// ── Team sizes ───────────────────────────────────────────────────────────────

describe("team sizes", () => {
  test("DEVELOPMENT_SWARM_TEAM has 13 members", () => {
    expect(DEVELOPMENT_SWARM_TEAM).toHaveLength(13);
  });

  test("REVENUE_SWARM_TEAM has 15 members", () => {
    expect(REVENUE_SWARM_TEAM).toHaveLength(15);
  });

  test("BUSINESS_OPERATIONS_SWARM_TEAM has 11 members", () => {
    expect(BUSINESS_OPERATIONS_SWARM_TEAM).toHaveLength(11);
  });

  test("TECHNICAL_SWARM_TEAM has 14 members", () => {
    expect(TECHNICAL_SWARM_TEAM).toHaveLength(14);
  });

  test("INVESTOR_MAGNET_SWARM_TEAM has 9 members", () => {
    expect(INVESTOR_MAGNET_SWARM_TEAM).toHaveLength(9);
  });
});

// ── No duplicate roles across all teams ──────────────────────────────────────

describe("cross-team uniqueness", () => {
  test("no duplicate roles across all teams", () => {
    const allRoles = [
      ...DEVELOPMENT_SWARM_TEAM,
      ...REVENUE_SWARM_TEAM,
      ...BUSINESS_OPERATIONS_SWARM_TEAM,
      ...TECHNICAL_SWARM_TEAM,
      ...INVESTOR_MAGNET_SWARM_TEAM,
    ].map((m) => m.role);
    expect(new Set(allRoles).size).toBe(allRoles.length);
  });

  test("no duplicate agents across all teams", () => {
    const allAgents = [
      ...DEVELOPMENT_SWARM_TEAM,
      ...REVENUE_SWARM_TEAM,
      ...BUSINESS_OPERATIONS_SWARM_TEAM,
      ...TECHNICAL_SWARM_TEAM,
      ...INVESTOR_MAGNET_SWARM_TEAM,
    ].map((m) => m.agent);
    expect(new Set(allAgents).size).toBe(allAgents.length);
  });
});

// ── agentForRole ─────────────────────────────────────────────────────────────

describe("agentForRole", () => {
  // Development team lookups
  test("returns ProductManagerAgent for product-manager", () => {
    expect(agentForRole("product-manager")).toBe("ProductManagerAgent");
  });

  test("returns SystemArchitectAgent for system-architect", () => {
    expect(agentForRole("system-architect")).toBe("SystemArchitectAgent");
  });

  test("returns TechLeadAgent for tech-lead", () => {
    expect(agentForRole("tech-lead")).toBe("TechLeadAgent");
  });

  test("returns OpenFrontendSpecialist for frontend-developer", () => {
    expect(agentForRole("frontend-developer")).toBe("OpenFrontendSpecialist");
  });

  test("returns BackendDeveloperAgent for backend-developer", () => {
    expect(agentForRole("backend-developer")).toBe("BackendDeveloperAgent");
  });

  test("returns TestEngineer for qa", () => {
    expect(agentForRole("qa")).toBe("TestEngineer");
  });

  test("returns DebugAgent for debug", () => {
    expect(agentForRole("debug")).toBe("DebugAgent");
  });

  // Revenue team lookups
  test("returns ChiefGrowthOfficerAgent for chief-growth-officer", () => {
    expect(agentForRole("chief-growth-officer")).toBe("ChiefGrowthOfficerAgent");
  });

  test("returns SalesCoachAgent for sales-coach", () => {
    expect(agentForRole("sales-coach")).toBe("SalesCoachAgent");
  });

  // Business operations team lookups
  test("returns CEOAgent for ceo", () => {
    expect(agentForRole("ceo")).toBe("CEOAgent");
  });

  test("returns CrisisResponseSwarmAgent for crisis-response", () => {
    expect(agentForRole("crisis-response")).toBe("CrisisResponseSwarmAgent");
  });

  // Technical team lookups
  test("returns HardwareArchitectAgent for hardware-architect", () => {
    expect(agentForRole("hardware-architect")).toBe("HardwareArchitectAgent");
  });

  test("returns EmbeddedRustAgent for embedded-rust", () => {
    expect(agentForRole("embedded-rust")).toBe("EmbeddedRustAgent");
  });

  test("returns PenetrationTestAgent for penetration-test", () => {
    expect(agentForRole("penetration-test")).toBe("PenetrationTestAgent");
  });

  // Investor magnet team lookups
  test("returns InvestorNarrativeAgent for investor-narrative", () => {
    expect(agentForRole("investor-narrative")).toBe("InvestorNarrativeAgent");
  });

  test("returns InvestorMetricsAgent for investor-metrics", () => {
    expect(agentForRole("investor-metrics")).toBe("InvestorMetricsAgent");
  });

  // Unknown role
  test("returns undefined for a role not in any team", () => {
    expect(agentForRole("nonexistent-role" as SwarmRole)).toBeUndefined();
  });

  // Exhaustive: every role in every team is reachable
  test("every role in all teams is resolvable via agentForRole", () => {
    const allMembers = [
      ...DEVELOPMENT_SWARM_TEAM,
      ...REVENUE_SWARM_TEAM,
      ...BUSINESS_OPERATIONS_SWARM_TEAM,
      ...TECHNICAL_SWARM_TEAM,
      ...INVESTOR_MAGNET_SWARM_TEAM,
    ];
    for (const member of allMembers) {
      expect(agentForRole(member.role)).toBe(member.agent);
    }
  });
});
