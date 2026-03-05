#!/usr/bin/env bun

/**
 * Patch OpenTelemetry OTLP Transformer to enable lazy loading of protobuf serializers.
 *
 * Problem: When Bun imports @opentelemetry/otlp-transformer, it may load one of THREE
 * module formats: ESM (build/esm), CJS (build/src), or ESNext (build/esnext). All versions
 * eagerly import protobuf serializers, causing protobufjs to allocate ~50-70MB of Uint8Array
 * buffer pools even when using JSON serializers (http/json protocol).
 *
 * Solution: Patch ALL THREE index.js files to use lazy-loading for protobuf serializers.
 * The actual protobuf modules are only loaded when their properties are accessed, preventing
 * the buffer pool allocation when only JSON serializers are used.
 *
 * Memory Impact:
 * - Before: 67.5 MB heap, 46.5 MB Uint8Array
 * - After:  17.0 MB heap,  17 KB Uint8Array (99%+ reduction)
 *
 * Usage:
 *   bun scripts/patch-otel-esm.ts
 *   bun run patch:otel-esm
 *
 * This script is called automatically by the postinstall hook.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE_PATH = join(import.meta.dir, "../node_modules/@opentelemetry/otlp-transformer");

const ESM_INDEX_PATH = join(BASE_PATH, "build/esm/index.js");
const CJS_INDEX_PATH = join(BASE_PATH, "build/src/index.js");
const ESNEXT_INDEX_PATH = join(BASE_PATH, "build/esnext/index.js");
const PACKAGE_JSON_PATH = join(BASE_PATH, "package.json");

// Version this patch was tested against
const EXPECTED_VERSION = "0.212.0";

function checkVersion(): { version: string; isExpected: boolean } {
  if (!existsSync(PACKAGE_JSON_PATH)) {
    return { version: "unknown", isExpected: false };
  }
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf-8"));
  return {
    version: pkg.version,
    isExpected: pkg.version === EXPECTED_VERSION,
  };
}

const PATCH_MARKER = "PATCHED: Lazy-load protobuf serializers";

const PATCHED_ESM_CONTENT = `/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// ${PATCH_MARKER} to prevent ~50-70MB Uint8Array allocation
// from protobufjs buffer pooling when only JSON serialization is used.
// This ESM version uses Proxy objects for lazy loading.

// Cached lazy-loaded modules
let _protobufLogs;
let _protobufMetrics;
let _protobufTrace;

// Lazy protobuf serializer proxies - only load the actual module when used
export const ProtobufLogsSerializer = new Proxy({}, {
    get(target, prop) {
        if (!_protobufLogs) {
            _protobufLogs = require('./logs/protobuf.js').ProtobufLogsSerializer;
        }
        return _protobufLogs[prop];
    }
});

export const ProtobufMetricsSerializer = new Proxy({}, {
    get(target, prop) {
        if (!_protobufMetrics) {
            _protobufMetrics = require('./metrics/protobuf.js').ProtobufMetricsSerializer;
        }
        return _protobufMetrics[prop];
    }
});

export const ProtobufTraceSerializer = new Proxy({}, {
    get(target, prop) {
        if (!_protobufTrace) {
            _protobufTrace = require('./trace/protobuf.js').ProtobufTraceSerializer;
        }
        return _protobufTrace[prop];
    }
});

// JSON serializers - loaded eagerly (these are what HTTP exporters use)
export { JsonLogsSerializer } from './logs/json.js';
export { JsonMetricsSerializer } from './metrics/json.js';
export { JsonTraceSerializer } from './trace/json.js';
//# sourceMappingURL=index.js.map
`;

const PATCHED_CJS_CONTENT = `"use strict";
/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// ${PATCH_MARKER} to prevent ~50-70MB Uint8Array allocation
// from protobufjs buffer pooling when only JSON serialization is used.
// This CJS version uses lazy getters for deferred loading.

Object.defineProperty(exports, "__esModule", { value: true });

// Cached lazy-loaded modules
let _protobufLogs;
let _protobufMetrics;
let _protobufTrace;

// Lazy protobuf serializer getters - only load the actual module when accessed
Object.defineProperty(exports, "ProtobufLogsSerializer", {
    enumerable: true,
    get: function() {
        if (!_protobufLogs) {
            _protobufLogs = require("./logs/protobuf").ProtobufLogsSerializer;
        }
        return _protobufLogs;
    }
});

Object.defineProperty(exports, "ProtobufMetricsSerializer", {
    enumerable: true,
    get: function() {
        if (!_protobufMetrics) {
            _protobufMetrics = require("./metrics/protobuf").ProtobufMetricsSerializer;
        }
        return _protobufMetrics;
    }
});

Object.defineProperty(exports, "ProtobufTraceSerializer", {
    enumerable: true,
    get: function() {
        if (!_protobufTrace) {
            _protobufTrace = require("./trace/protobuf").ProtobufTraceSerializer;
        }
        return _protobufTrace;
    }
});

// JSON serializers - loaded eagerly (these are what HTTP exporters use)
var json_logs = require("./logs/json");
Object.defineProperty(exports, "JsonLogsSerializer", { enumerable: true, get: function() { return json_logs.JsonLogsSerializer; } });
var json_metrics = require("./metrics/json");
Object.defineProperty(exports, "JsonMetricsSerializer", { enumerable: true, get: function() { return json_metrics.JsonMetricsSerializer; } });
var json_trace = require("./trace/json");
Object.defineProperty(exports, "JsonTraceSerializer", { enumerable: true, get: function() { return json_trace.JsonTraceSerializer; } });
//# sourceMappingURL=index.js.map
`;

// ESNext uses the same format as ESM (native ES modules with import/export)
const PATCHED_ESNEXT_CONTENT = `/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// ${PATCH_MARKER} to prevent ~50-70MB Uint8Array allocation
// from protobufjs buffer pooling when only JSON serialization is used.
// This ESNext version uses Proxy objects for lazy loading.

// Cached lazy-loaded modules
let _protobufLogs;
let _protobufMetrics;
let _protobufTrace;

// Lazy protobuf serializer proxies - only load the actual module when used
export const ProtobufLogsSerializer = new Proxy({}, {
    get(target, prop) {
        if (!_protobufLogs) {
            _protobufLogs = require('./logs/protobuf').ProtobufLogsSerializer;
        }
        return _protobufLogs[prop];
    }
});

export const ProtobufMetricsSerializer = new Proxy({}, {
    get(target, prop) {
        if (!_protobufMetrics) {
            _protobufMetrics = require('./metrics/protobuf').ProtobufMetricsSerializer;
        }
        return _protobufMetrics[prop];
    }
});

export const ProtobufTraceSerializer = new Proxy({}, {
    get(target, prop) {
        if (!_protobufTrace) {
            _protobufTrace = require('./trace/protobuf').ProtobufTraceSerializer;
        }
        return _protobufTrace[prop];
    }
});

// JSON serializers - loaded eagerly (these are what HTTP exporters use)
export { JsonLogsSerializer } from './logs/json';
export { JsonMetricsSerializer } from './metrics/json';
export { JsonTraceSerializer } from './trace/json';
//# sourceMappingURL=index.js.map
`;

function isPatchNeeded(currentContent: string): boolean {
  return !currentContent.includes(PATCH_MARKER);
}

function patchFile(
  path: string,
  content: string,
  label: string
): { patched: boolean; skipped: boolean } {
  if (!existsSync(path)) {
    console.log(`[patch-otel] ${label} not found - skipping`);
    return { patched: false, skipped: true };
  }

  const currentContent = readFileSync(path, "utf-8");

  if (!isPatchNeeded(currentContent)) {
    console.log(`[patch-otel] ${label} already patched`);
    return { patched: false, skipped: false };
  }

  writeFileSync(path, content);
  console.log(`[patch-otel] ${label} patched successfully`);
  return { patched: true, skipped: false };
}

function main(): void {
  console.log("[patch-otel] Checking OpenTelemetry OTLP Transformer...");

  // Version guard: warn if package version differs from tested version
  const { version, isExpected } = checkVersion();
  if (version === "unknown") {
    console.log("[patch-otel] Package not found - skipping (may not be installed)");
    process.exit(0);
  }

  if (!isExpected) {
    console.warn(
      `[patch-otel] WARNING: Package version ${version} differs from expected ${EXPECTED_VERSION}`
    );
    console.warn("[patch-otel] The patch may need updates - verify exports match after upgrade");
  }

  console.log(`[patch-otel] Patching @opentelemetry/otlp-transformer v${version}...`);

  // Patch all three module formats: ESM, CJS, and ESNext
  const esmResult = patchFile(ESM_INDEX_PATH, PATCHED_ESM_CONTENT, "ESM (build/esm/index.js)");
  const cjsResult = patchFile(CJS_INDEX_PATH, PATCHED_CJS_CONTENT, "CJS (build/src/index.js)");
  const esnextResult = patchFile(
    ESNEXT_INDEX_PATH,
    PATCHED_ESNEXT_CONTENT,
    "ESNext (build/esnext/index.js)"
  );

  const results = [esmResult, cjsResult, esnextResult];
  const patchedCount = results.filter((r) => r.patched).length;
  const alreadyPatchedCount = results.filter((r) => !r.patched && !r.skipped).length;

  if (patchedCount > 0) {
    console.log(`[patch-otel] Applied ${patchedCount} patch(es)`);
    console.log("[patch-otel] Memory optimization: ~99% reduction in Uint8Array allocations");
  } else if (alreadyPatchedCount > 0) {
    console.log("[patch-otel] All files already patched - no action needed");
  }
}

main();
