<!-- Context: core/standards/iso24089-reference | Priority: high | Version: 1.0 | Updated: 2026-05-13 -->

# ISO 24089:2023 Reference — Road Vehicles Software Update Engineering

**Purpose**: Provide OpenAgent and subagents with direct access to the complete ISO 24089:2023 standard repository for software update engineering, SUMS compliance, OTA release readiness, and type-approval evidence.

**Location**: `@iso24089_standard/` (project root)

**Format**:
- `ISO_24089_2023_Raw_Extraction.txt` — Complete text extraction of all standard pages (~50KB, machine-readable)
- `ISO_24089_2023_Tutorial.txt` — Comprehensive tutorial with explanations, examples, and implementation guidance (~316KB)
- `page_001.png` through `page_036.png` — High-resolution page scans of the full standard

---

## Standard Overview

ISO 24089:2023 is the world's first comprehensive international standard dedicated exclusively to software update engineering for road vehicles. It establishes requirements and recommendations for:

- **Organizational Level**: Governance, continuous improvement, information sharing, supporting processes, auditing
- **Project Level**: Planning, tailoring, interoperability confirmation, integrity preservation
- **Infrastructure Level**: Cybersecurity risk management, vehicle configuration information management, campaign communication, package processing
- **Vehicle and Vehicle Systems Level**: Risk management, configuration information handling, campaign communication, package processing

**Key relationship**: ISO 24089:2023 provides the technical foundation for UN R156 (Software Update Management System) type approval. It references ISO 26262 (functional safety) and ISO/SAE 21434 (cybersecurity engineering).

---

## Repository File Index

### Text-Based Resources (Primary)

| File | Content | Usage |
|------|---------|-------|
| `ISO_24089_2023_Raw_Extraction.txt` | Complete raw text extraction of all 36 pages, including all clauses, requirements, definitions, and work products | Primary source for requirement IDs, exact wording, and clause structure |
| `ISO_24089_2023_Tutorial.txt` | Comprehensive tutorial with: executive overview, hierarchical architecture explanation, all 26 terms with detailed analysis, clause-by-clause guidance, organizational/project/infrastructure/vehicle level breakdowns, software update package requirements, campaign management, standards relationships, implementation roadmap | Primary source for understanding, examples, compatibility verification methods, and practical implementation guidance |

### Visual/Page References

| File | Content |
|------|---------|
| `page_001.png` | Cover page, standard metadata |
| `page_002.png` | Copyright, foreword |
| `page_003.png` | Introduction |
| `page_004.png` | Introduction continued, scope start |
| `page_005.png` | Scope, normative references, terms and definitions start |
| `page_006.png` | Terms and definitions continued (3.1 general terminology) |
| `page_007.png` | Terms continued (3.1) |
| `page_008.png` | Terms continued (3.1) |
| `page_009.png` | Terms continued (3.2 software update operation terms) |
| `page_010.png` | Terms continued (3.2) |
| `page_011.png` | Terms continued (3.2), organizational level start (Clause 4) |
| `page_012.png` | Organizational level continued |
| `page_013.png` | Organizational level continued, project level start (Clause 5) |
| `page_014.png` | Project level continued |
| `page_015.png` | Project level continued, infrastructure level start (Clause 6) |
| `page_016.png` | Infrastructure level continued |
| `page_017.png` | Infrastructure level continued |
| `page_018.png` | Infrastructure level continued, vehicle level start (Clause 7) |
| `page_019.png` | Vehicle and vehicle systems level continued |
| `page_020.png` | Vehicle level continued |
| `page_021.png` | Vehicle level continued, software update package (Clause 8) |
| `page_022.png` | Software update package continued |
| `page_023.png` | Software update package continued, software update campaign (Clause 9) |
| `page_024.png` | Software update campaign continued |
| `page_025.png` | Software update campaign continued |
| `page_026.png` | Software update campaign continued |
| `page_027.png` | Software update campaign continued |
| `page_028.png` | Annex A (informative), bibliography start |
| `page_029.png` | Bibliography continued |
| `page_030.png` | Bibliography continued |
| `page_031.png` | Bibliography continued |
| `page_032.png` | Bibliography continued |
| `page_033.png` | Bibliography continued |
| `page_034.png` | Bibliography continued |
| `page_035.png` | Bibliography continued |
| `page_036.png` | Final bibliography entries, back matter |

---

## Key Definitions (from Raw Extraction)

### General Terminology (3.1)

| Term | Definition |
|------|------------|
| **Compatibility** | Capability of software to be executable on vehicle systems without conflicts. Note: Can be checked via vehicle configuration information. |
| **Condition** | Criteria required for a software update operation to be completed successfully. Examples: Skilled person present, safe vehicle state, in-vehicle resources available, external resources available. |
| **Corrective action** | Action to eliminate or contain a problem or failure |
| **Cybersecurity** | Road vehicle cybersecurity — context where assets are sufficiently protected against threat scenarios to vehicle systems and infrastructure required to support software update engineering |
| **Interoperability** | Ability of two or more systems to exchange information and use it |
| **Integrity** | Accuracy and completeness of software and data |
| **Software update campaign** | Set of coordinated activities to distribute and install software updates to target vehicle populations |
| **Software update package** | Collection of software and metadata required to perform a software update operation |
| **Vehicle configuration information** | Data describing the hardware and software configuration of a vehicle |

### Terms Related to Software Update Operation (3.2)

| Term | Definition |
|------|------------|
| **Rollback** | Action to revert software to a previous version |
| **Skilled person** | Person with appropriate training and competence |
| **Software update operation** | Activity to replace or modify software on a vehicle system |

---

## Hierarchical Architecture

### Level 1 — Organizational
- Governance processes and organizational rules
- Continuous improvement requirements
- Information sharing policies
- Supporting processes (documentation, requirements management, configuration management, change management, tool management)
- Auditing requirements

### Level 2 — Project
- Project management and planning
- Tailoring and rationale documentation
- Interoperability confirmation
- Integrity preservation

### Level 3 — Infrastructure
- Cybersecurity risk management for software updates
- Vehicle configuration information management
- Software update campaign communication
- Software update package processing

### Level 4 — Vehicle and Vehicle Systems
- Risk management (functional safety and cybersecurity)
- Vehicle configuration information handling
- Campaign communication at vehicle level
- Software update package processing at vehicle level

---

## Agent Usage Patterns

### For OTA and Software Update Design

When designing OTA update systems:

1. **Read**: `ISO_24089_2023_Raw_Extraction.txt` for exact requirement wording
2. **Read**: `ISO_24089_2023_Tutorial.txt` for implementation guidance and examples
3. **Reference**: Organizational level requirements for governance structures
4. **Reference**: Infrastructure level for backend/cloud OTA platform design
5. **Reference**: Vehicle level for in-vehicle update client design
6. **Reference**: Software update package (Clause 8) for package format and metadata
7. **Reference**: Software update campaign (Clause 9) for campaign management workflows

### For UN R156 / SUMS Compliance

When preparing for type approval under UN R156:

1. **Read**: `ISO_24089_2023_Tutorial.txt` Section 1.1 for regulatory context
2. **Map**: ISO 24089 clauses to UN R156 requirements
3. **Evidence**: Use raw extraction to identify exact requirements and work products
4. **Audit**: Reference organizational level auditing requirements
5. **Traceability**: Map software update engineering activities across all four hierarchy levels

### For Supplier Management

When managing Tier-1/2 suppliers for update-capable ECUs:

1. **Reference**: Clause 7 (distributed activities concepts) from tutorial
2. **Require**: Compatibility verification methods from tutorial Section 1.4.1
3. **Verify**: Vehicle configuration information management
4. **Contract**: Reference interface agreement templates (cross-reference with ISO 21434 Annex C)

### For Compatibility and Configuration Management

When verifying update compatibility:

1. **Read**: Tutorial Section 1.4.1 COMPATIBILITY for technical dimensions
2. **Check**: Hardware compatibility (processor, memory, peripherals)
3. **Check**: Software architecture compatibility (OS, APIs, protocols)
4. **Check**: Functional compatibility (features, calibration, integration)
5. **Check**: Version compatibility (baseline, dependencies, config data)
6. **Method**: Pre-update compatibility checking via vehicle configuration information

---

## Standards Relationships

ISO 24089:2023 interacts with:

| Standard | Relationship |
|----------|--------------|
| **ISO 26262** | Functional safety — software updates must not degrade safety integrity levels |
| **ISO/SAE 21434** | Cybersecurity engineering — software updates are a key cybersecurity activity (Clause 13.4) |
| **UN R156** | Regulatory mandate — ISO 24089 provides technical implementation basis |
| **UN R155** | Cybersecurity management — software update capability is a CSMS requirement |

**Cross-reference approach**: When working on software update engineering, load BOTH this reference AND `@.opencode/context/core/standards/iso21434-reference.md` because:
- ISO 21434 Clause 13.4 (Updates) directly relates to ISO 24089
- Cybersecurity risk management for updates must satisfy both standards
- TARA for update mechanisms uses ISO 21434 methods
- Interface agreements with suppliers must cover both cybersecurity and update engineering

---

## Integration with Swarm Workflows

**TechnicalComplianceVVAgent** MUST load this reference when:
- Designing or reviewing OTA update architectures
- Mapping software update requirements to tests and evidence
- Building SUMS compliance evidence for type approval
- Performing gap analysis for UN R156 readiness

**RegulatoryComplianceSwarmAgent** MUST load this reference when:
- Monitoring UN R156 / ISO 24089 regulatory requirements
- Preparing type-approval evidence packages
- Responding to customer RFPs requiring SUMS compliance
- Auditing software update engineering processes

**SecurityFirmwareAgent** SHOULD reference this when:
- Designing secure boot and update verification mechanisms
- Implementing package signature verification
- Ensuring update rollback safety
- Protecting vehicle configuration information

**TechnicalReleaseAgent** SHOULD reference this when:
- Building OTA release packages
- Documenting campaign communication plans
- Creating release notes and customer advisories
- Preparing SBOM and compatibility matrices

**SystemArchitectAgent** SHOULD reference this when:
- Designing vehicle E/E architectures with update capability
- Planning backend OTA infrastructure
- Defining vehicle configuration information schemas
- Architecting campaign management systems

---

## Reading Strategy for Agents

For **quick requirement lookup**:
```
1. Open ISO_24089_2023_Raw_Extraction.txt
2. Search for requirement keywords or clause numbers
3. Extract exact requirement text and context
```

For **deep understanding and implementation**:
```
1. Open ISO_24089_2023_Tutorial.txt
2. Navigate to relevant part (1-8)
3. Read executive overview, then detailed sections
4. Extract examples and verification methods
5. Cross-reference with raw extraction for exact requirement IDs
```

For **vision-capable verification**:
```
1. Reference page_xxx.png for original standard layout
2. Use when exact figure/table formatting matters
3. Verify tutorial interpretations against original text
```
