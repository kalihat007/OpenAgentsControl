---
description: "Run a regulatory and compliance swarm for UN R155, ISO/SAE 21434, ISO 24089, UN R156, EU RED, WP.29, regional standards, evidence, or customer RFP readiness"
---

<compliance_request>$ARGUMENTS</compliance_request>

@.opencode/context/core/business-operations-swarms.md

# Compliance Swarm

Route to RegulatoryComplianceSwarmAgent.

**Standard Repositories Available**:
- `@iso21434_standard/` — Complete ISO/SAE 21434:2021 (88 JPG scans)
- `@iso24089_standard/` — Complete ISO 24089:2023 (text extraction + tutorial + 36 page scans)

**Mandatory Context Loading**:
- For ISO 21434 work: `@.opencode/context/core/standards/iso21434-reference.md`
- For ISO 24089 / SUMS / OTA work: `@.opencode/context/core/standards/iso24089-reference.md`

Return:

- standards and regions in scope
- product/customer scope
- compliance gaps
- evidence package needs
- RFP/customer-readiness output
- next monitoring cadence
