/* src/graphql/types.ts - TypeScript Types for GraphQL */

import type { capellaConn } from "../lib/couchbaseConnector";

/**
 * GraphQL resolver context interface
 */
export interface ResolverContext {
  cluster: capellaConn;
  requestId: string;
  clientIp: string;
  userAgent?: string;
  timestamp: number;
}

/**
 * Base resolver function type
 */
export type Resolver<TArgs = Record<string, any>, TResult = any> = (
  parent: any,
  args: TArgs,
  context: ResolverContext,
  info: any
) => Promise<TResult> | TResult;

/**
 * Input types for GraphQL operations
 */
export interface LooksArgs {
  brand: string;
  season: string;
  division: string;
  limit?: number;
  offset?: number;
}

export interface LookDetailsArgs {
  lookId: string;
}

export interface OptionsArgs {
  lookId: string;
  category?: string;
  color?: string;
  size?: string;
  limit?: number;
  offset?: number;
}

export interface OptionsSummaryArgs {
  brand: string;
  season: string;
  division: string;
}

export interface AssignmentsArgs {
  userId: string;
  status?: "pending" | "approved" | "rejected";
  limit?: number;
  offset?: number;
}

export type HealthArgs = Record<string, never>;

/**
 * Output types for GraphQL operations
 */
export interface Look {
  id: string;
  name: string;
  description?: string;
  images: string[];
  status: "active" | "inactive" | "draft";
  brand: string;
  season: string;
  division: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export interface LooksResult {
  looks: Look[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
  brand: string;
  season: string;
  division: string;
}

export interface LookDetails extends Look {
  options?: Option[];
  assignments?: Assignment[];
  analytics?: {
    views: number;
    likes: number;
    shares: number;
  };
}

export interface Option {
  id: string;
  lookId: string;
  name: string;
  category: string;
  color?: string;
  size?: string;
  price?: number;
  currency?: string;
  images: string[];
  status: "available" | "out_of_stock" | "discontinued";
  metadata?: Record<string, any>;
}

export interface OptionsResult {
  options: Option[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
  lookId: string;
  filters: {
    category?: string;
    color?: string;
    size?: string;
  };
}

export interface OptionsSummary {
  brand: string;
  season: string;
  division: string;
  totalOptions: number;
  optionsByCategory: Record<string, number>;
  optionsByColor?: Record<string, number>;
  optionsBySize?: Record<string, number>;
  priceRange?: {
    min: number;
    max: number;
    currency: string;
  };
  lastUpdated: string;
}

export interface Assignment {
  id: string;
  userId: string;
  lookId: string;
  status: "pending" | "approved" | "rejected";
  assignedAt: string;
  assignedBy: string;
  approvedAt?: string;
  approvedBy?: string;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface AssignmentsResult {
  assignments: Assignment[];
  pagination?: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
  userId: string;
  filters: {
    status?: string;
  };
}

export interface HealthStatus {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  database: "connected" | "disconnected" | "error";
  version: string;
  uptime: number;
  environment: string;
  checks: {
    database: boolean;
    telemetry: boolean;
    cache: boolean;
  };
}

/**
 * Error types for better error handling
 */
export interface GraphQLErrorExtensions {
  code: string;
  statusCode: number;
  timestamp: string;
  requestId?: string;
  context?: Record<string, any>;
}

/**
 * Validation schemas for input arguments
 */
export interface ValidationRules {
  brand: {
    minLength: 1;
    maxLength: 50;
    pattern: RegExp;
  };
  season: {
    pattern: RegExp; // e.g., /^\d{4}[SFW]$/ for "2024S"
  };
  division: {
    enum: ["WOMEN", "MEN", "KIDS"];
  };
  lookId: {
    minLength: 1;
    maxLength: 100;
    pattern: RegExp; // ULID or UUID pattern
  };
  userId: {
    minLength: 1;
    maxLength: 100;
  };
  limit: {
    min: 1;
    max: 100;
    default: 20;
  };
  offset: {
    min: 0;
    default: 0;
  };
}

/**
 * Database query interfaces
 */
export interface DatabaseQueryOptions {
  parameters: Record<string, any>;
  timeout?: number;
  consistency?: "eventual" | "strong";
  metrics?: boolean;
}

export interface DatabaseResult<T> {
  rows: T[];
  meta?: {
    requestID: string;
    clientContextID: string;
    signature: any;
    warnings?: any[];
    metrics?: {
      elapsedTime: string;
      executionTime: string;
      resultCount: number;
      resultSize: number;
    };
  };
}

/**
 * Cache interfaces
 */
export interface CacheOptions {
  ttl?: number;
  key?: string;
  invalidatePattern?: RegExp;
}

/**
 * Resolver map interface
 */
export interface Resolvers {
  Query: {
    looks: Resolver<LooksArgs, LooksResult>;
    lookDetails: Resolver<LookDetailsArgs, LookDetails>;
    options: Resolver<OptionsArgs, OptionsResult>;
    optionsSummary: Resolver<OptionsSummaryArgs, OptionsSummary>;
    assignments: Resolver<AssignmentsArgs, AssignmentsResult>;
    health: Resolver<HealthArgs, HealthStatus>;
  };
  // Add Mutation and Subscription types if needed
  // Mutation?: {
  //   [key: string]: Resolver<any, any>;
  // };
  // Subscription?: {
  //   [key: string]: Resolver<any, any>;
  // };
}

/**
 * Utility types for resolver development
 */
export type ResolverResult<T> = Promise<T> | T;
export type MaybePromise<T> = T | Promise<T>;

/**
 * Helper type for nullable fields
 */
export type Maybe<T> = T | null | undefined;

/**
 * Helper type for pagination arguments
 */
export interface PaginationArgs {
  limit?: number;
  offset?: number;
  cursor?: string;
}

/**
 * Helper type for filter arguments
 */
export interface FilterArgs {
  [key: string]: any;
}

/**
 * Combined arguments type for complex queries
 */
export type ComplexArgs<T extends Record<string, unknown> = Record<string, never>> = T &
  Partial<PaginationArgs> &
  Partial<FilterArgs>;

/**
 * Resolver information interface
 */
export interface ResolverInfo {
  fieldName: string;
  fieldNodes: any[];
  returnType: any;
  parentType: any;
  path: any;
  schema: any;
  fragments: Record<string, any>;
  rootValue: any;
  operation: any;
  variableValues: Record<string, any>;
}

/**
 * Performance tracking interface
 */
export interface ResolverMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  cacheHit?: boolean;
  databaseQueries?: number;
  errors?: number;
}

/**
 * Audit log interface for resolver actions
 */
export interface ResolverAuditLog {
  resolver: string;
  args: Record<string, any>;
  result?: any;
  error?: string;
  userId?: string;
  requestId: string;
  timestamp: string;
  duration: number;
  metadata?: Record<string, any>;
}
