# Documentation Currency Audit Design

**Date:** 2026-03-05
**Status:** Approved
**Linear Issue:** [SIO-455](https://linear.app/siobytes/issue/SIO-455/documentation-currency-audit-comprehensive-evaluation)

## Problem Statement

Documentation can drift from code reality over time. This audit ensures all active documentation accurately reflects the current codebase state.

## Requirements

| Dimension | Requirement |
|-----------|-------------|
| **Audit scope** | Comprehensive (accuracy, coverage, commands, links, staleness) |
| **Deliverable** | Report + automated fixes for simple discrepancies |
| **Scope** | Active docs only (exclude docs/archive/) |

## Approach

Category-by-category sweep with fixes applied incrementally. Each phase completes before moving to the next, allowing fixes to compound (e.g., fixing a number in README before checking links that reference README).

## Phase 1: Factual Accuracy

### What We Verify

| Claim | Source of Truth | Files to Check |
|-------|-----------------|----------------|
| Test count (3191) | `bun test` output | README.md, test/README.md, CLAUDE.md |
| Endpoint count (17) | router.ts routes | README.md, docs/api/endpoints.md |
| Test file counts | Actual file counts | test/README.md |
| Chaos test count (57) | Test file assertions | README.md, test/README.md |
| Lifecycle test count (197) | Test file assertions | test/README.md |

### Fix Strategy

Direct edits to update numbers where they differ from verified values.

## Phase 2: Command Validation

### What We Verify

All documented `bun run` commands:
- docs/development/getting-started.md
- README.md quick commands
- test/README.md test commands

### Verification Method

Run each command with timeout, check exit code or expected output pattern.

### Fix Strategy

- Update commands that have changed names
- Remove commands that no longer exist
- Add missing commonly-used commands

## Phase 3: Feature Coverage

### What We Verify

| Code Location | Documentation Location |
|---------------|------------------------|
| src/routes/router.ts endpoints | docs/api/endpoints.md |
| src/config/schemas.ts variables | docs/configuration/environment.md |
| src/errors/error-codes.ts | docs/operations/troubleshooting.md |

### Fix Strategy

Add missing documentation for undocumented features. Flag significant gaps for manual review.

## Phase 4: Link Integrity

### What We Verify

- Internal markdown links (`[text](docs/file.md)`)
- Section anchors (`#section-name`)
- External URLs (spot check only)

### Scope

All markdown files in:
- docs/ (excluding docs/archive/)
- README.md
- CLAUDE.md
- test/README.md

### Fix Strategy

- Fix broken internal links
- Flag broken external links in report (don't auto-fix)

## Phase 5: Staleness Detection

### What We Verify

- References to removed files/functions
- Deprecated feature mentions without sunset notices
- Version numbers (Bun version, package versions)

### Fix Strategy

- Remove stale references
- Add deprecation notices where appropriate
- Update version numbers from package.json

## Deliverables

1. **Summary Report** - Markdown table of all findings with status (fixed/flagged/skipped)
2. **Applied Fixes** - Direct edits committed with Linear issue reference
3. **Flagged Items** - Issues requiring manual review listed in report

## Success Criteria

- All numeric claims match verified values
- All documented commands execute successfully
- No broken internal links
- Feature coverage gaps identified and documented
- Clear report of what was fixed vs what needs manual attention

## Out of Scope

- docs/archive/ directory
- Performance claim verification (would require load testing)
- External link deep validation (rate limiting concerns)
- Semantic accuracy of explanatory text (subjective)
