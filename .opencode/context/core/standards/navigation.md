<!-- Context: core/navigation | Priority: critical | Version: 1.0 | Updated: 2026-02-15 -->

# Core Standards Navigation

**Purpose**: Universal standards for all development work

---

## Files

| File | Topic | Priority | Load When |
|------|-------|----------|-----------|
| `code-quality.md` | Code quality rules | ⭐⭐⭐⭐⭐ | Writing/reviewing code |
| `test-coverage.md` | Testing standards | ⭐⭐⭐⭐⭐ | Writing tests |
| `documentation.md` | Documentation rules | ⭐⭐⭐⭐ | Writing docs |
| `security-patterns.md` | Security best practices | ⭐⭐⭐⭐ | Security review, patterns |
| `project-intelligence.md` | What and why | ⭐⭐⭐⭐ | Onboarding, understanding projects |
| `project-intelligence-management.md` | How to manage | ⭐⭐⭐ | Managing intelligence files |
| `code-analysis.md` | Analysis approaches | ⭐⭐⭐ | Analyzing code, debugging |
| `iso21434-reference.md` | ISO/SAE 21434:2021 standard repository reference | ⭐⭐⭐⭐⭐ | TARA, compliance evidence, audit, gap analysis, UN R155 |
| `iso24089-reference.md` | ISO 24089:2023 standard repository reference | ⭐⭐⭐⭐⭐ | Software update engineering, SUMS, UN R156, OTA compliance |
| `typescript.md` | Universal TypeScript patterns | ⭐⭐⭐⭐ | Writing/reviewing TypeScript code |
| `csharp.md` | Universal C# / .NET patterns | ⭐⭐⭐⭐ | Writing/reviewing C# code |
| `csharp-project-structure.md` | ASP.NET Core project structure (Minimal APIs, CQRS, EF Core + PostgreSQL) | ⭐⭐⭐⭐ | Starting or structuring a C# API project |

---

## Loading Strategy

**For code implementation**:
1. Load `code-quality.md` (critical)
2. Load `security-patterns.md` (high)

**For TypeScript code**:
1. Load `typescript.md` (critical)
2. Load `code-quality.md` (high)

**For C# / .NET code**:
1. Load `csharp.md` (critical)
2. Load `code-quality.md` (high)

**For C# API project structure**:
1. Load `csharp-project-structure.md` (critical)
2. Load `csharp.md` (high)

**For testing**:
1. Load `test-coverage.md` (critical)
2. Depends on: `code-quality.md`

**For documentation**:
1. Load `documentation.md` (critical)

**For code review**:
1. Load `code-quality.md` (critical)
2. Load `security-patterns.md` (high)
3. Load `test-coverage.md` (high)

**For project onboarding/understanding**:
1. Load `project-intelligence.md` (high)
2. Then load: `../../project-intelligence/` folder for full project context

**For ISO/SAE 21434 cybersecurity compliance**:
1. Load `iso21434-reference.md` (critical)
2. Access `@iso21434_standard/` for full standard images
3. Route to TechnicalComplianceVVAgent or RegulatoryComplianceSwarmAgent

**For ISO 24089 software update engineering / SUMS compliance**:
1. Load `iso24089-reference.md` (critical)
2. Access `@iso24089_standard/` for text extraction, tutorial, and page scans
3. Route to TechnicalComplianceVVAgent or RegulatoryComplianceSwarmAgent

**For combined cybersecurity + update compliance**:
1. Load `iso21434-reference.md` (critical)
2. Load `iso24089-reference.md` (critical)
3. Cross-reference ISO 21434 Clause 13.4 (Updates) with ISO 24089 requirements

---

## Related

- **Workflows** → `../workflows/navigation.md`
- **Development Principles** → `../../development/principles/`
- **Project Intelligence** → `../../project-intelligence/navigation.md` (full project context)
