# Implementation Plan: @stryker-mutator/bun-runner Plugin

**Status**: Planning Phase
**Estimated Effort**: 2-3 days
**Complexity**: High
**Priority**: Critical (blocks mutation testing)

## Problem Statement

Stryker's `testRunner: "command"` cannot detect test coverage, resulting in:
- All mutants marked as "covered 0"
- No mutants actually tested
- Mutation testing completely non-functional

**Root Cause**: Command runner is a black box - Stryker cannot:
- Discover which test files exist
- Map test files to source files
- Determine coverage relationships
- Track individual test results

## Critical Constraint

**Bun has no programmatic test execution API**. Unlike Jest's `jest.run()` or Mocha's programmatic interface, Bun is CLI-only. This fundamentally limits our implementation options.

## Proposed Solution: Hybrid Test Runner

Build `@stryker-mutator/bun-runner` plugin using a **hybrid approach**:
1. **Process Spawning**: Execute Bun CLI as child process (like command runner)
2. **Static Analysis**: Pre-analyze test files to build coverage map
3. **Structured Output**: Parse Bun's dots/junit output for results
4. **Coverage Mapping**: Track test-to-source-file relationships

### Architecture Overview

```
┌─────────────────────────────────────────────┐
│  Stryker Core                               │
│  ├─ Instrumenter (creates mutants)          │
│  └─ Mutation Test Executor                  │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│  @stryker-mutator/bun-runner (NEW)          │
│  ├─ BunTestRunner (implements TestRunner)   │
│  ├─ Coverage Analyzer (static analysis)     │
│  ├─ Process Manager (spawn Bun CLI)         │
│  └─ Output Parser (parse dots/junit)        │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│  Bun CLI                                     │
│  └─ bun test --reporter=dots ./test/bun     │
└─────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Static Coverage Analyzer (Day 1, 4-6 hours)

**Goal**: Build test-to-source-file coverage map using static analysis

**Implementation**:
1. **Scan test directory** for all `*.test.ts` files
2. **Parse each test file** using TypeScript parser
3. **Extract imports** from each test file
   - Direct imports: `import { foo } from '../../../src/utils/foo'`
   - Transitive imports: Follow import chains
4. **Build coverage map**:
   ```typescript
   interface CoverageMap {
     [sourceFile: string]: Set<testFile: string>
   }
   ```
5. **Cache results** for incremental updates

**Challenges**:
- Handling dynamic imports
- Transitive dependencies (import chains)
- Test files that import multiple source files

**Output**: `CoverageAnalyzer` class that generates coverage map

### Phase 2: Bun Process Manager (Day 1-2, 4-6 hours)

**Goal**: Spawn and manage Bun test processes

**Implementation**:
1. **Process Spawning**:
   ```typescript
   class BunProcessManager {
     async runTests(testFiles: string[]): Promise<TestResult>
     async runWithMutant(mutantId: string, testFiles: string[]): Promise<TestResult>
   }
   ```

2. **Environment Variables**:
   - `__STRYKER_MUTANT_COVERAGE__=true` (for coverage tracking)
   - `__STRYKER_ACTIVE_MUTANT__=<mutantId>` (for mutant activation)
   - `LOG_LEVEL=silent` (suppress logs)

3. **Output Capture**:
   - Capture stdout/stderr
   - Parse in real-time for faster feedback
   - Handle process timeouts

4. **Error Handling**:
   - Process crashes
   - Timeouts
   - Invalid output

**Output**: `BunProcessManager` class

### Phase 3: Output Parser (Day 2, 3-4 hours)

**Goal**: Parse Bun test output to extract test results

**Implementation**:
1. **Dots Reporter Parser**:
   ```
   Input:  "..F...."
   Output: { passed: 6, failed: 1, total: 7 }
   ```

2. **Summary Parser**:
   ```
   Input:  "1523 pass\n0 fail\n..."
   Output: { passed: 1523, failed: 0 }
   ```

3. **Error Extraction**:
   - Parse failure messages
   - Extract stack traces
   - Map to test names (if possible)

4. **JUnit XML Parser** (fallback):
   - Parse `--reporter-outfile` XML
   - More detailed test info
   - Slower but more reliable

**Output**: `BunOutputParser` class

### Phase 4: Test Runner Implementation (Day 2, 4-6 hours)

**Goal**: Implement Stryker `TestRunner` interface

**Implementation**:
```typescript
import { TestRunner, DryRunResult, MutantRunOptions, MutantRunResult } from '@stryker-mutator/api/test-runner';

class BunTestRunner implements TestRunner {
  private coverageAnalyzer: CoverageAnalyzer;
  private processManager: BunProcessManager;
  private outputParser: BunOutputParser;

  async init(): Promise<void> {
    // Build coverage map
    this.coverageMap = await this.coverageAnalyzer.analyze();
  }

  async dryRun(options: DryRunOptions): Promise<DryRunResult> {
    // Run all tests to establish baseline
    const result = await this.processManager.runTests(options.testFilePaths);
    return this.outputParser.parse(result);
  }

  async mutantRun(options: MutantRunOptions): Promise<MutantRunResult> {
    // 1. Determine which tests cover this mutant
    const testFiles = this.coverageMap.getTestsFor(options.mutatedFile);

    // 2. Run only those tests with mutant activated
    const result = await this.processManager.runWithMutant(
      options.mutantId,
      testFiles
    );

    // 3. Parse results
    return this.outputParser.parse(result);
  }

  async dispose(): Promise<void> {
    // Cleanup
  }

  capabilities() {
    return {
      reloadEnvironment: false, // Bun doesn't support environment reloading
    };
  }
}
```

**Output**: Working `BunTestRunner` class

### Phase 5: Plugin Declaration & Packaging (Day 3, 2-3 hours)

**Goal**: Package as npm module and register with Stryker

**Implementation**:
1. **Plugin Declaration**:
   ```typescript
   import { declareClassPlugin, PluginKind } from '@stryker-mutator/api/plugin';
   import { BunTestRunner } from './bun-test-runner';

   export const strykerPlugins = [
     declareClassPlugin(PluginKind.TestRunner, 'bun', BunTestRunner)
   ];
   ```

2. **Package Structure**:
   ```
   @stryker-mutator/bun-runner/
   ├── src/
   │   ├── bun-test-runner.ts
   │   ├── coverage-analyzer.ts
   │   ├── process-manager.ts
   │   ├── output-parser.ts
   │   └── index.ts
   ├── test/
   │   └── (unit tests)
   ├── package.json
   ├── tsconfig.json
   └── README.md
   ```

3. **Dependencies**:
   ```json
   {
     "dependencies": {
       "@stryker-mutator/api": "^9.4.0",
       "@stryker-mutator/util": "^9.4.0",
       "fast-xml-parser": "^4.0.0"
     },
     "peerDependencies": {
       "bun": "^1.3.0"
     }
   }
   ```

4. **Configuration**:
   ```json
   // stryker.config.json
   {
     "testRunner": "bun",
     "plugins": ["@stryker-mutator/bun-runner"],
     "coverageAnalysis": "off" // Static analysis handles coverage
   }
   ```

**Output**: Published npm package

### Phase 6: Testing & Validation (Day 3, 3-4 hours)

**Goal**: Validate plugin works correctly

**Testing**:
1. **Unit Tests**: Test each component in isolation
2. **Integration Tests**: Test with real Bun test suite
3. **Mutation Tests**: Validate mutation detection works
4. **Performance Tests**: Measure overhead vs command runner

**Validation Criteria**:
- All mutants properly tested (no "covered 0")
- Correct mutation scores calculated
- Performance acceptable (< 2x overhead vs command runner)
- Works with incremental mode
- Handles failures gracefully

## Alternative Approaches Considered

### 1. Wait for Bun Programmatic API
**Pros**: Future-proof, cleaner architecture
**Cons**: Timeline unknown (could be months/years), blocks current work
**Decision**: Rejected - Need solution now

### 2. Fork Bun Test Runner
**Pros**: Full control, could add missing features
**Cons**: Maintenance burden, diverges from official Bun, complex
**Decision**: Rejected - Too much ongoing maintenance

### 3. Use Different Mutation Tool
**Pros**: Might have better Bun support
**Cons**: Limited options, Stryker is most mature, would lose existing setup
**Decision**: Rejected - Stryker is industry standard

### 4. Accept Command Runner Limitations
**Pros**: No additional work
**Cons**: Mutation testing doesn't work at all
**Decision**: Rejected - Defeats purpose of mutation testing

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Static analysis misses coverage | Medium | High | Validate against actual test runs, allow manual overrides |
| Bun CLI changes break parser | Low | High | Pin Bun version, add integration tests, monitor Bun releases |
| Performance overhead too high | Medium | Medium | Optimize coverage analysis, cache results, profile bottlenecks |
| Edge cases not handled | Medium | Medium | Comprehensive testing, graceful degradation, clear error messages |
| Plugin API compatibility issues | Low | High | Follow Stryker docs closely, test with multiple Stryker versions |

## Success Metrics

- **Functional**: All 39 mutants in error-codes.ts properly tested
- **Accurate**: Mutation scores match expected values
- **Performance**: < 10 min for full mutation run (vs infinite for command runner)
- **Reliable**: 100% test run success rate
- **Maintainable**: Clear code structure, comprehensive tests

## Timeline

- **Day 1** (8-10 hours):
  - Morning: Phase 1 - Coverage Analyzer
  - Afternoon: Phase 2 - Process Manager

- **Day 2** (8-10 hours):
  - Morning: Phase 3 - Output Parser
  - Afternoon: Phase 4 - Test Runner Implementation

- **Day 3** (6-8 hours):
  - Morning: Phase 5 - Plugin Packaging
  - Afternoon: Phase 6 - Testing & Validation

**Total**: 22-28 hours across 3 days

## Dependencies

- **External**:
  - @stryker-mutator/api@^9.4.0
  - TypeScript parser (for static analysis)
  - XML parser (for junit output)

- **Internal**:
  - Existing Bun wrapper script
  - Test suite must use consistent patterns
  - Clear test file naming convention

## Rollback Plan

If implementation fails or takes too long:
1. Revert stryker.config.json to command runner
2. Accept "full suite only" mutation testing
3. Document limitations in CLAUDE.md
4. File feature request with Bun team for programmatic API
5. Revisit in 3-6 months when Bun ecosystem matures

## References

- [Stryker Plugin Guide](https://stryker-mutator.io/docs/stryker-js/guides/create-a-plugin/)
- [@stryker-mutator/api Documentation](https://www.npmjs.com/package/@stryker-mutator/api)
- [Bun Test Runner](https://bun.com/docs/test)
- [Bun Coverage](https://bun.com/docs/test/coverage)
- [Jest Runner Source](https://github.com/stryker-mutator/stryker-js/tree/master/packages/jest-runner) (reference implementation)

## Next Steps

1. **Get user approval** on this plan
2. **Create Linear issue**: SIO-XXX: Build @stryker-mutator/bun-runner plugin
3. **Set up project structure**: Create separate directory/repo
4. **Start Phase 1**: Coverage Analyzer implementation
5. **Incremental testing**: Test each phase before moving to next
