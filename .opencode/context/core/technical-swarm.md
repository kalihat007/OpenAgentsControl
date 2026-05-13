<!-- Context: core/technical-swarm | Priority: critical | Version: 1.0 | Updated: 2026-05-11 -->

# Technical Swarm

Technical swarms are the deep-tech R&D lab for HackersEra-style cybersecurity products. They handle hardware-software co-design, embedded constraints, automotive protocols, safety/security compliance, VAPT, HIL/SIL, and release evidence.

Default domain: cybersecurity or cybersecurity-testing tools, especially automotive, embedded, hardware-assisted, or protocol-security platforms.

## Deep-Tech R&D Roles

| Tier | Agent | Responsibility |
|------|-------|----------------|
| Architecture | SystemArchitectAgent | product topology, bus matrix, SoC/MCU/FPGA selection, safety/security boundaries |
| Architecture | HardwareArchitectAgent | schematics, PCB, SI/PI, EMC, DFM/DFT, power, connectors |
| Architecture | FPGAASICAgent | HDL, bridges, DMA, timing closure, formal checks |
| Architecture | RTOSOSAgent | AUTOSAR, FreeRTOS, QNX, Linux BSP, Yocto, scheduling |
| Implementation | EmbeddedCPPCodingAgent | drivers, stacks, MCAL-like modules, MISRA/AUTOSAR-aligned firmware |
| Implementation | AutomotiveEthernetAgent | 100/1000BASE-T1, TSN, SOME/IP, DDS, capture/injection |
| Implementation | SecurityFirmwareAgent | secure boot, HSM/TPM, crypto, key lifecycle, anti-tamper |
| Implementation | TechnicalPythonToolingAgent | host tooling, automation, PC utilities, data analysis, reports |
| Implementation | EmbeddedRustAgent | memory-safe parsers, no_std modules, fuzzable protocol code |
| V&V | HILSILAgent | dSPACE/Vector/NI benches, CANoe, vTESTstudio, fault campaigns |
| V&V | PenetrationTestAgent | fuzzing, RE, side-channel, fault injection, wireless, physical, network |
| V&V | TechnicalComplianceVVAgent | ISO/SAE 21434, UN R155, ISO 24089, UN R156, EVITA/HEAVENS, TARA, evidence |
| V&V | EMCEnvironmentalAgent | CISPR 25, ISO 11452, ISO 7637, ESD, thermal, vibration |
| DevOps | TechnicalCICDAgent | Yocto, toolchains, HDL/software CI, artifact signing |
| Release | TechnicalReleaseAgent | SBOM, CVE/license, OTA, release notes, advisories |
| Docs | DocWriter | hardware manual, API reference, integration guide, security whitepaper |

## Execution Patterns

### Hardware-Software Co-Design

Use for new products such as CAN interfaces, GMSL2 tools, EV charging testers, secure gateways, and hardware-assisted cybersecurity test tools.

1. SystemArchitectAgent decomposes product topology.
2. SecurityFirmwareAgent and PenetrationTestAgent define attack surface.
3. TechnicalComplianceVVAgent maps ISO/SAE 21434, UN R155, ISO 24089, UN R156, ISO 26262, and OEM needs.
4. HardwareArchitectAgent, FPGAASICAgent, RTOSOSAgent, EmbeddedCPPCodingAgent, and TechnicalPythonToolingAgent design in parallel after contracts.
5. HILSILAgent, EMCEnvironmentalAgent, PenetrationTestAgent, and TechnicalComplianceVVAgent run adversarial verification.
6. TechnicalCICDAgent and TechnicalReleaseAgent prepare reproducible builds, SBOM, signing, and release evidence.

### Cybersecurity Testing Campaign

Use for VAPT of EV charging, gateways, ECUs, CAN/LIN/FlexRay/Ethernet, OTA, cloud APIs, or hardware targets.

Parallel tracks:

- protocol analysis
- reverse engineering
- fuzzing
- side-channel/fault injection
- wireless/physical access
- backend/cloud/network tests
- report synthesis and remediation roadmap

### Continuous Compliance / Living TARA

Weekly or release-bound loop:

- ingest threat intel and CVEs
- update TARA risk scores
- trace requirements to mitigations and tests
- update penetration plan
- collect evidence
- produce product and customer compliance dashboards
- monitor ISO 24089 software update engineering compliance
- verify OTA/SUMS evidence readiness for type approval

### Night-Shift Autonomy

Use for controlled overnight analysis:

1. detect CVE/threat/regulatory change
2. assess affected products
3. create branch/recovery plan
4. run unit/static/HIL/security tests
5. update evidence and release artifacts
6. leave human approval packet for morning review

## Parallelization Boundaries

Sequential:

- architecture contracts
- pinout/register contracts
- migrations to shared BSP/bootloader
- security key lifecycle and provisioning design
- release signing

Parallel:

- hardware/FPGA/firmware/host-tool design after interface contracts
- independent protocol variants
- VAPT attack vectors
- HIL matrix across benches
- docs/evidence generation after stable artifacts

## Required Artifacts

```text
.tmp/technical/{session-id}/
  technical-plan.json
  architecture.json
  hardware-design.json
  firmware-plan.json
  fpga-plan.json
  attack-surface.json
  hil-sil-matrix.json
  compliance-trace.json
  release-evidence.json
  iso21434-evidence.json
  iso24089-evidence.json
  tara-workbook.json
  incidents.jsonl
  artifacts/
  reports/
```

## Completion Standard

A technical swarm is complete only when:

- hardware/software contracts are explicit
- security attack surface and mitigations are mapped
- verification plan covers unit, integration, HIL/SIL, penetration, compliance, and release checks
- traceability evidence exists for safety/security requirements
- release artifacts include SBOM/signing/advisory expectations
