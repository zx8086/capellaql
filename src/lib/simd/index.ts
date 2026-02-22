/* src/lib/simd/index.ts */

/**
 * SIMD-Accelerated Utilities Index
 * Centralized exports for all Bun SIMD-optimized utilities
 *
 * These utilities leverage Bun's native SIMD (Single Instruction, Multiple Data)
 * capabilities for faster:
 * - Hashing (Bun.hash)
 * - Deep comparison (Bun.deepEquals)
 * - Pattern matching (Bun.Glob)
 * - Object inspection (Bun.inspect)
 */

// Bun native utilities
export { BunCompare, BunGlob } from "../../utils/bunUtils";
// Cache utilities - SIMD-accelerated key generation
export { generateHashedKey, generateOperationKey } from "../bunSQLiteCache";
// Batch Processing - SIMD-accelerated batch comparison
export {
  type BatchProcessingResult,
  BatchProcessor,
  createCompoundIndex,
  createDocumentIndex,
  diffDocumentArrays,
  filterChangedDocuments,
  findMatching,
  groupDocuments,
  mergeMapsWithTracking,
  partitionDocuments,
  processBatches,
} from "../couchbaseBatchProcessor";
// Change Detection - SIMD-accelerated document comparison
export {
  type ChangeDetectionResult,
  createChangeSummary,
  detectBatchChanges,
  detectChanges,
  hasDocumentChanged,
  haveFieldsChanged,
  smartCacheUpdate,
} from "../couchbaseChangeDetector";
// Document ID Generation - SIMD-accelerated hashing
export {
  createIdPattern,
  DocumentIds,
  type DocumentPrefix,
  DocumentPrefixes,
  generateBatchIds,
  getDocumentPrefix,
  isDocumentType,
  isValidDocumentId,
  parseDocumentId,
} from "../couchbaseDocumentIds";
// GraphQL Deduplication - SIMD-accelerated array deduplication
export {
  countDuplicates,
  createDeduplicator,
  type DeduplicationOptions,
  type DeduplicationStats,
  deduplicateByFields,
  deduplicateById,
  deduplicateEdges,
  deduplicateResults,
  deduplicateWithMerge,
  deduplicateWithStats,
  findDuplicates,
  hasDuplicates,
  mergeAndDeduplicate,
  stableDeduplicateById,
} from "../graphqlDeduplication";
// Query Fingerprinting - SIMD-accelerated cache key generation
export {
  createBatchFingerprint,
  createPersistedQueryId,
  createQueryFingerprint,
  createSubscriptionFingerprint,
  type FingerprintOptions,
  QueryFingerprintBuilder,
  verifyFingerprint,
} from "../queryFingerprint";
