# Documentation Currency Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Audit all active documentation for accuracy, fix discrepancies, and produce a summary report.

**Architecture:** Sequential 5-phase sweep - verify factual accuracy, validate commands, check feature coverage, test link integrity, detect staleness. Fix as we go, compile findings into final report.

**Tech Stack:** Bun runtime, bash commands, grep/glob for extraction, markdown editing

---

## Phase 1: Factual Accuracy

### Task 1.1: Verify Test Count

**Files:**
- Check: `README.md`
- Check: `test/README.md`
- Check: `CLAUDE.md`
- Check: `docs/development/testing.md`

**Step 1: Get actual test count**

Run: `bun test 2>&1 | grep -E "^\s*[0-9]+ pass"`
Expected output pattern: ` 3191 pass` (or similar number)

**Step 2: Search for test count claims in docs**

Run: `grep -rn "3191\|3[0-9]\{3\} tests" docs/ README.md CLAUDE.md test/README.md --include="*.md" | grep -v archive`

**Step 3: Compare and note discrepancies**

If actual count differs from 3191, note all files needing updates.

**Step 4: Fix discrepancies (if any)**

Edit each file to update test count to actual value.

**Step 5: Commit if changes made**

```bash
git add -A
git commit -m "SIO-XXX: Update test count to [actual] across documentation"
```

---

### Task 1.2: Verify Endpoint Count

**Files:**
- Read: `src/routes/router.ts`
- Check: `README.md`
- Check: `docs/api/endpoints.md`

**Step 1: Count actual endpoints in router**

Run: `grep -E '^\s+"/' src/routes/router.ts | wc -l`

The routes object defines these endpoints:
- `/` (GET)
- `/health` (GET)
- `/health/telemetry` (GET)
- `/health/metrics` (GET)
- `/health/ready` (GET)
- `/metrics` (GET)
- `/tokens` (GET)
- `/tokens/validate` (GET)
- `/debug/metrics/test` (POST)
- `/debug/metrics/export` (POST)
- `/debug/profiling/start` (POST)
- `/debug/profiling/stop` (POST)
- `/debug/profiling/status` (GET)
- `/debug/profiling/reports` (GET)
- `/debug/profiling/cleanup` (POST)
- `/debug/profiling/report` (GET)

Total: 16 unique route paths

**Step 2: Check documented endpoint count**

Run: `grep -n "17 endpoints\|16 endpoints\|endpoints.*17\|endpoints.*16" README.md docs/api/endpoints.md`

**Step 3: Fix if discrepancy exists**

If docs claim 17 but actual is 16, update to 16.

**Step 4: Commit if changes made**

```bash
git add -A
git commit -m "SIO-XXX: Fix endpoint count (16 not 17)"
```

---

### Task 1.3: Verify Chaos Test Count

**Files:**
- Check: `README.md`
- Check: `test/README.md`
- Run: `test/chaos/*.test.ts`

**Step 1: Get actual chaos test count**

Run: `bun test test/chaos/ 2>&1 | grep -E "^\s*[0-9]+ pass"`

**Step 2: Check documented count**

Run: `grep -n "57 chaos\|57 tests" README.md test/README.md`

**Step 3: Fix if discrepancy exists**

Update files if actual differs from 57.

**Step 4: Commit if changes made**

```bash
git add -A
git commit -m "SIO-XXX: Update chaos test count to [actual]"
```

---

### Task 1.4: Verify Lifecycle Test Count

**Files:**
- Check: `test/README.md`
- Run: `test/bun/lifecycle/*.test.ts` or similar

**Step 1: Get actual lifecycle test count**

Run: `bun test test/bun/lifecycle/ 2>&1 | grep -E "^\s*[0-9]+ pass"` (adjust path if needed)

Or search for lifecycle test files:
Run: `find test -name "*lifecycle*" -type f`

**Step 2: Check documented count (197)**

Run: `grep -n "197" test/README.md`

**Step 3: Fix if discrepancy exists**

**Step 4: Commit if changes made**

---

### Task 1.5: Verify Test File Counts per Category

**Files:**
- Check: `test/README.md` claims about file counts

**Step 1: Count actual test files by category**

```bash
# Unit tests in test/bun/
find test/bun -name "*.test.ts" | wc -l

# Chaos tests
find test/chaos -name "*.test.ts" | wc -l

# Integration tests
find test/integration -name "*.test.ts" | wc -l

# Playwright E2E
find test/playwright -name "*.ts" | wc -l

# K6 performance
find test/k6 -name "*.ts" -not -name "*.d.ts" | wc -l
```

**Step 2: Compare with test/README.md table**

The table claims:
- Unit Tests: 105 files
- Lifecycle Tests: 5 files
- Chaos Tests: 4 files
- Integration Tests: 4 files
- E2E Tests: 4 files
- Performance Tests: 21 files

**Step 3: Update table if counts differ**

**Step 4: Commit if changes made**

---

## Phase 2: Command Validation

### Task 2.1: Validate Quick Start Commands

**Files:**
- Check: `README.md` (Quick Commands section)

**Step 1: Test each documented command**

Commands to verify:
```bash
# Should work (development)
timeout 5s bun run dev || echo "dev server started"

# Should work (typecheck)
bun run typecheck

# Should work (quality check)
bun run quality:check
```

**Step 2: Note any failing commands**

**Step 3: Fix documentation for any changed command names**

**Step 4: Commit if changes made**

---

### Task 2.2: Validate Test Commands

**Files:**
- Check: `README.md`
- Check: `test/README.md`
- Check: `docs/development/getting-started.md`

**Step 1: Test documented test commands**

```bash
# Unit tests
bun run test:bun --help || bun run test:bun 2>&1 | head -5

# Check E2E command exists
grep "test:e2e" package.json

# Check K6 commands exist
grep "test:k6" package.json
```

**Step 2: Verify command names match package.json scripts**

Run: `grep -E "\"test:" package.json | head -20`

**Step 3: Update docs if command names have changed**

**Step 4: Commit if changes made**

---

### Task 2.3: Validate Docker Commands

**Files:**
- Check: `README.md`
- Check: `docs/deployment/docker.md`

**Step 1: Verify docker commands exist in package.json**

```bash
grep -E "\"docker:" package.json
```

**Step 2: Check documented commands match**

**Step 3: Update if discrepancies found**

**Step 4: Commit if changes made**

---

## Phase 3: Feature Coverage

### Task 3.1: Verify All Endpoints Documented

**Files:**
- Source: `src/routes/router.ts`
- Docs: `docs/api/endpoints.md`

**Step 1: List all endpoints from router**

Extract endpoint paths from router.ts (16 total).

**Step 2: Check each is documented in endpoints.md**

Search for each path in endpoints.md.

**Step 3: Add documentation for any missing endpoints**

**Step 4: Commit if changes made**

---

### Task 3.2: Verify Config Variables Documented

**Files:**
- Source: `src/config/schemas.ts`, `src/config/envMapping.ts`
- Docs: `docs/configuration/environment.md`

**Step 1: Extract all env variables from config**

```bash
grep -E "process\.env\.|z\." src/config/schemas.ts src/config/envMapping.ts | grep -oE "[A-Z_]{3,}" | sort -u
```

**Step 2: Check each is documented in environment.md**

**Step 3: Add documentation for any missing variables**

**Step 4: Commit if changes made**

---

### Task 3.3: Verify Error Codes Documented

**Files:**
- Source: `src/errors/error-codes.ts`
- Docs: `docs/operations/troubleshooting.md`
- Docs: `CLAUDE.md` (error codes table)

**Step 1: Extract all error codes from source**

```bash
grep -rE "AUTH_[0-9]{3}" src/ --include="*.ts" | grep -oE "AUTH_[0-9]{3}" | sort -u
```

**Step 2: Check each is documented**

**Step 3: Add documentation for any missing codes**

**Step 4: Commit if changes made**

---

## Phase 4: Link Integrity

### Task 4.1: Check Internal Markdown Links

**Files:**
- All: `docs/**/*.md`, `README.md`, `CLAUDE.md`, `test/README.md`

**Step 1: Extract all internal links**

```bash
grep -rhoE "\]\([^)]+\.md[^)]*\)" docs/ README.md CLAUDE.md test/README.md | sort -u
```

**Step 2: Verify each linked file exists**

For each link like `](docs/foo/bar.md)`, check file exists.

**Step 3: Fix or remove broken links**

**Step 4: Commit if changes made**

---

### Task 4.2: Check Section Anchor Links

**Files:**
- All markdown files with anchor links

**Step 1: Extract anchor links**

```bash
grep -rhoE "\]\(#[^)]+\)" docs/ README.md | sort -u
```

**Step 2: Verify anchors exist in same file**

**Step 3: Fix broken anchors**

**Step 4: Commit if changes made**

---

## Phase 5: Staleness Detection

### Task 5.1: Check Bun Version References

**Files:**
- Check: `README.md`
- Check: `docs/development/getting-started.md`
- Source: `package.json`

**Step 1: Get current Bun version requirement**

```bash
grep -E "bun|engines" package.json
```

**Step 2: Check documented Bun versions**

```bash
grep -rn "Bun.*v[0-9]" docs/ README.md
```

**Step 3: Update if versions are outdated**

**Step 4: Commit if changes made**

---

### Task 5.2: Check for References to Removed Features

**Files:**
- All docs (excluding archive)

**Step 1: Search for potentially stale references**

Look for:
- Old file paths that no longer exist
- Deprecated API mentions
- References to removed config options

**Step 2: Verify each reference is still valid**

**Step 3: Remove or update stale references**

**Step 4: Commit if changes made**

---

## Phase 6: Final Report

### Task 6.1: Compile Audit Report

**Files:**
- Create: `docs/plans/2026-03-05-documentation-audit-report.md`

**Step 1: Create summary report**

```markdown
# Documentation Currency Audit Report

**Date:** 2026-03-05
**Auditor:** Claude Code

## Summary

| Category | Items Checked | Issues Found | Fixed | Flagged |
|----------|---------------|--------------|-------|---------|
| Factual Accuracy | X | Y | Z | W |
| Command Validation | X | Y | Z | W |
| Feature Coverage | X | Y | Z | W |
| Link Integrity | X | Y | Z | W |
| Staleness | X | Y | Z | W |

## Fixes Applied

1. [List each fix with commit reference]

## Flagged for Manual Review

1. [List items requiring human decision]

## Recommendations

1. [Any process improvements identified]
```

**Step 2: Commit report**

```bash
git add docs/plans/2026-03-05-documentation-audit-report.md
git commit -m "SIO-XXX: Add documentation currency audit report"
```

---

## Execution Notes

- Each task should take 2-5 minutes
- Commit after each task that makes changes
- Track findings for final report as you go
- Skip archived docs entirely
- For external links, just verify they look valid (don't spam requests)
