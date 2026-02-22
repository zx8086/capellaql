/* src/lib/couchbaseDocumentIds.ts */

/**
 * Couchbase Document ID Generation
 * Uses Bun.hash() for SIMD-accelerated, deterministic document ID generation
 * Provides consistent, collision-resistant document keys
 */

import { generateHashedKey } from "./bunSQLiteCache";

/**
 * Document ID prefixes for different document types
 */
export const DocumentPrefixes = {
  LOOK: "look",
  OPTION: "opt",
  STYLE: "style",
  IMAGE: "img",
  ASSIGNMENT: "asgn",
  USER: "user",
  SESSION: "sess",
  CACHE: "cache",
  AUDIT: "audit",
} as const;

export type DocumentPrefix = (typeof DocumentPrefixes)[keyof typeof DocumentPrefixes];

/**
 * Generate a hashed document ID with prefix
 */
function createDocumentId(prefix: DocumentPrefix, ...components: (string | number | boolean)[]): string {
  const input = components.map(String).join(":");
  const hash = generateHashedKey(input);
  return `${prefix}::${hash}`;
}

/**
 * Generate a simple prefixed document ID (no hashing)
 */
function createSimpleDocumentId(prefix: DocumentPrefix, id: string): string {
  return `${prefix}::${id}`;
}

/**
 * Document ID generators for different entity types
 */
export const DocumentIds = {
  /**
   * Generate ID for look documents
   * Composite key: brand + season + look number
   */
  look: (brand: string, season: string, lookNumber: number | string): string => {
    return createDocumentId(DocumentPrefixes.LOOK, brand, season, lookNumber);
  },

  /**
   * Generate ID for look by direct ID
   */
  lookById: (lookId: string): string => {
    return createSimpleDocumentId(DocumentPrefixes.LOOK, lookId);
  },

  /**
   * Generate ID for option documents
   * Composite key: style code + color code + size code
   */
  option: (styleCode: string, colorCode: string, sizeCode: string): string => {
    return createDocumentId(DocumentPrefixes.OPTION, styleCode, colorCode, sizeCode);
  },

  /**
   * Generate ID for option by SKU
   */
  optionBySku: (sku: string): string => {
    return createSimpleDocumentId(DocumentPrefixes.OPTION, sku);
  },

  /**
   * Generate ID for style documents
   */
  style: (brandCode: string, styleCode: string, seasonCode: string): string => {
    return createDocumentId(DocumentPrefixes.STYLE, brandCode, styleCode, seasonCode);
  },

  /**
   * Generate ID for image metadata documents
   */
  image: (divisionCode: string, styleSeasonCode: string, styleCode: string, imageType?: string): string => {
    const components = [divisionCode, styleSeasonCode, styleCode];
    if (imageType) components.push(imageType);
    return createDocumentId(DocumentPrefixes.IMAGE, ...components);
  },

  /**
   * Generate ID for assignment documents
   */
  assignment: (styleSeasonCode: string, companyCode: string, divisionCode: string): string => {
    return createDocumentId(DocumentPrefixes.ASSIGNMENT, styleSeasonCode, companyCode, divisionCode);
  },

  /**
   * Generate ID for seasonal assignments
   */
  seasonalAssignment: (styleSeasonCode: string, companyCode?: string): string => {
    return createDocumentId(DocumentPrefixes.ASSIGNMENT, "seasonal", styleSeasonCode, companyCode || "all");
  },

  /**
   * Generate ID for user documents
   */
  user: (userId: string): string => {
    return createSimpleDocumentId(DocumentPrefixes.USER, userId);
  },

  /**
   * Generate ID for user by email
   */
  userByEmail: (email: string): string => {
    return createDocumentId(DocumentPrefixes.USER, "email", email.toLowerCase());
  },

  /**
   * Generate ID for session documents
   * Includes timestamp for uniqueness
   */
  session: (userId: string, deviceId?: string): string => {
    const timestamp = Date.now();
    const components = [userId, deviceId || "web", timestamp];
    return createDocumentId(DocumentPrefixes.SESSION, ...components);
  },

  /**
   * Generate deterministic session ID (for lookup)
   */
  sessionLookup: (userId: string, deviceId: string): string => {
    return createDocumentId(DocumentPrefixes.SESSION, "lookup", userId, deviceId);
  },

  /**
   * Generate ID for cache metadata documents
   */
  cacheEntry: (cacheType: string, key: string): string => {
    return createDocumentId(DocumentPrefixes.CACHE, cacheType, key);
  },

  /**
   * Generate ID for audit log documents
   */
  audit: (entityType: string, entityId: string, action: string, timestamp?: number): string => {
    const ts = timestamp || Date.now();
    return createDocumentId(DocumentPrefixes.AUDIT, entityType, entityId, action, ts);
  },
};

/**
 * Parse a document ID to extract its components
 */
export function parseDocumentId(documentId: string): {
  prefix: string;
  hash: string;
  isHashed: boolean;
} {
  const parts = documentId.split("::");

  if (parts.length !== 2) {
    return { prefix: "", hash: documentId, isHashed: false };
  }

  const [prefix, hash] = parts;
  const isHashed = /^[0-9a-f]+$/i.test(hash);

  return { prefix, hash, isHashed };
}

/**
 * Validate document ID format
 */
export function isValidDocumentId(documentId: string, expectedPrefix?: DocumentPrefix): boolean {
  const { prefix, hash } = parseDocumentId(documentId);

  if (!prefix || !hash) {
    return false;
  }

  if (expectedPrefix && prefix !== expectedPrefix) {
    return false;
  }

  return true;
}

/**
 * Get the prefix from a document ID
 */
export function getDocumentPrefix(documentId: string): string | null {
  const { prefix } = parseDocumentId(documentId);
  return prefix || null;
}

/**
 * Check if a document ID matches a specific type
 */
export function isDocumentType(documentId: string, prefix: DocumentPrefix): boolean {
  return documentId.startsWith(`${prefix}::`);
}

/**
 * Generate a batch of document IDs
 */
export function generateBatchIds<T>(items: T[], idGenerator: (item: T) => string): Map<T, string> {
  const idMap = new Map<T, string>();

  for (const item of items) {
    idMap.set(item, idGenerator(item));
  }

  return idMap;
}

/**
 * Create a document ID pattern for range queries
 * Returns a pattern that can be used in N1QL LIKE queries
 */
export function createIdPattern(prefix: DocumentPrefix, ...partialComponents: string[]): string {
  if (partialComponents.length === 0) {
    return `${prefix}::%`;
  }

  const partial = partialComponents.join(":");
  const partialHash = generateHashedKey(partial);
  // Return pattern for documents starting with this partial hash
  return `${prefix}::${partialHash.substring(0, 8)}%`;
}

export default {
  DocumentPrefixes,
  DocumentIds,
  parseDocumentId,
  isValidDocumentId,
  getDocumentPrefix,
  isDocumentType,
  generateBatchIds,
  createIdPattern,
};
