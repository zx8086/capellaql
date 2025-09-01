import { ExecutionResult } from 'graphql';
import { Maybe, Plugin, PromiseOrValue, YogaInitialContext } from 'graphql-yoga';
import { BuildResponseCacheKeyFunction as EnvelopBuildResponseCacheKeyFunction, Cache as EnvelopCache, createInMemoryCache as envelopCreateInMemoryCache, ResponseCacheExtensions as EnvelopResponseCacheExtensions, UseResponseCacheParameter as UseEnvelopResponseCacheParameter } from '@envelop/response-cache';
export { cacheControlDirective, hashSHA256 } from '@envelop/response-cache';
export type BuildResponseCacheKeyFunction = (params: Parameters<EnvelopBuildResponseCacheKeyFunction>[0] & {
    request: Request;
}) => ReturnType<EnvelopBuildResponseCacheKeyFunction>;
export type UseResponseCacheParameter<TContext = YogaInitialContext> = Omit<UseEnvelopResponseCacheParameter, 'getDocumentString' | 'session' | 'cache' | 'enabled' | 'buildResponseCacheKey'> & {
    cache?: Cache;
    session: (request: Request, context: TContext) => PromiseOrValue<Maybe<string>>;
    enabled?: (request: Request, context: TContext) => boolean;
    buildResponseCacheKey?: BuildResponseCacheKeyFunction;
};
export interface ResponseCachePluginExtensions {
    http?: {
        headers?: Record<string, string>;
    };
    responseCache: EnvelopResponseCacheExtensions;
    [key: string]: unknown;
}
export interface Cache extends EnvelopCache {
    get(key: string): PromiseOrValue<ExecutionResult<Record<string, unknown>, ResponseCachePluginExtensions> | undefined>;
}
export declare function useResponseCache<TContext = YogaInitialContext>(options: UseResponseCacheParameter<TContext>): Plugin;
export declare const createInMemoryCache: (...args: Parameters<typeof envelopCreateInMemoryCache>) => Cache;
