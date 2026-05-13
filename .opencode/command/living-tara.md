---
description: "Run a continuous compliance and living TARA swarm for ISO/SAE 21434, UN R155, ISO 24089, UN R156, product threats, requirements, tests, and evidence"
---

<tara_request>$ARGUMENTS</tara_request>

@.opencode/context/core/technical-swarm.md

# Living TARA

Route to TechnicalComplianceVVAgent with supporting technical roles.

**Standard Repositories Available**:
- `@iso21434_standard/` — Complete ISO/SAE 21434:2021 (88 JPG scans of all clauses, annexes, TARA methods, CAL tables, impact/attack feasibility ratings)
- `@iso24089_standard/` — Complete ISO 24089:2023 (text extraction + tutorial + 36 page scans)

**Mandatory Context Loading**:
- Load `@.opencode/context/core/standards/iso21434-reference.md` for TARA methods, impact rating, attack feasibility, CAL determination, and work product mapping
- Load `@.opencode/context/core/standards/iso24089-reference.md` when software update engineering or SUMS compliance is in scope

Return:

- changed threat signals
- affected products/features
- updated risks and controls
- requirement trace updates
- test plan updates
- evidence package updates
- iso21434 evidence trace updates
- iso24089 / SUMS evidence updates (if in scope)
- customer-facing posture report outline
