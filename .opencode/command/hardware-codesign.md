---
description: "Run a hardware-software co-design swarm for a cybersecurity hardware product such as CAN, GMSL2, EV charging, gateway, or Ethernet tools"
---

<product_request>$ARGUMENTS</product_request>

@.opencode/context/core/technical-swarm.md

# Hardware-Software Co-Design

Route to the technical swarm:

1. SystemArchitectAgent defines topology and interfaces.
2. HardwareArchitectAgent defines hardware architecture and constraints.
3. FPGAASICAgent defines programmable logic where needed.
4. RTOSOSAgent defines OS/BSP/boot architecture.
5. EmbeddedCPPCodingAgent and SecurityFirmwareAgent define firmware slices.
6. TechnicalPythonToolingAgent defines host tooling.
7. HILSILAgent, PenetrationTestAgent, TechnicalComplianceVVAgent, and EMCEnvironmentalAgent define verification.
8. TechnicalCICDAgent and TechnicalReleaseAgent define reproducible release path.

Return a co-design plan and approval gates.
