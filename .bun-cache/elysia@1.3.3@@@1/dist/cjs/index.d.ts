import { Memoirist } from 'memoirist';
import { type TObject, type Static, type TSchema, type TModule, type TRef, type TProperties } from '@sinclair/typebox';
import type { Context } from './context';
import { type Sucrose } from './sucrose';
import type { WSLocalHook } from './ws/types';
import type { ElysiaAdapter } from './adapter/types';
import type { ListenCallback, Serve, Server } from './universal/server';
import { PromiseGroup } from './utils';
import { type DynamicHandler } from './dynamic-handle';
import { ValidationError, type ParseError, type NotFoundError, type InternalServerError, ElysiaCustomStatusResponse } from './error';
import type { TraceHandler } from './trace';
import type { ElysiaConfig, SingletonBase, DefinitionBase, ComposedHandler, InputSchema, LocalHook, MergeSchema, RouteSchema, UnwrapRoute, InternalRoute, HTTPMethod, PreHandler, BodyHandler, OptionalHandler, ErrorHandler, LifeCycleStore, MaybePromise, Prettify, Prettify2, AddPrefix, AddSuffix, AddPrefixCapitalize, AddSuffixCapitalize, MaybeArray, GracefulHandler, MapResponse, MacroManager, MacroToProperty, TransformHandler, MetadataBase, RouteBase, CreateEden, ComposeElysiaResponse, InlineHandler, HookContainer, LifeCycleType, MacroQueue, EphemeralType, ExcludeElysiaResponse, ModelValidator, BaseMacroFn, ContextAppendType, Reconcile, AfterResponseHandler, HigherOrderFunction, ResolvePath, JoinPath, ValidatorLayer, MergeElysiaInstances, HookMacroFn, ResolveHandler, ResolveResolutions, MacroToContext, StandaloneValidator, GuardSchemaType, Or, PrettifySchema, IsNever, DocumentDecoration, AfterHandler } from './types';
export type AnyElysia = Elysia<any, any, any, any, any, any, any>;
/**
 * ### Elysia Server
 * Main instance to create web server using Elysia
 *
 * ---
 * @example
 * ```typescript
 * import { Elysia } from 'elysia'
 *
 * new Elysia()
 *     .get("/", () => "Hello")
 *     .listen(3000)
 * ```
 */
export default class Elysia<const in out BasePath extends string = '', const in out Singleton extends SingletonBase = {
    decorator: {};
    store: {};
    derive: {};
    resolve: {};
}, const in out Definitions extends DefinitionBase = {
    typebox: {};
    error: {};
}, const in out Metadata extends MetadataBase = {
    schema: {};
    standaloneSchema: {};
    macro: {};
    macroFn: {};
    parser: {};
}, const out Routes extends RouteBase = {}, const in out Ephemeral extends EphemeralType = {
    derive: {};
    resolve: {};
    schema: {};
    standaloneSchema: {};
}, const in out Volatile extends EphemeralType = {
    derive: {};
    resolve: {};
    schema: {};
    standaloneSchema: {};
}> {
    config: ElysiaConfig<BasePath>;
    server: Server | null;
    private dependencies;
    '~Prefix': BasePath;
    '~Singleton': Singleton;
    '~Definitions': Definitions;
    '~Metadata': Metadata;
    '~Ephemeral': Ephemeral;
    '~Volatile': Volatile;
    '~Routes': Routes;
    protected singleton: SingletonBase;
    get store(): Singleton['store'];
    get decorator(): Singleton['decorator'];
    protected definitions: {
        typebox: TModule<{}, {}>;
        type: Record<string, TSchema>;
        error: Record<string, Error>;
    };
    protected extender: {
        macros: MacroQueue[];
        higherOrderFunctions: HookContainer<HigherOrderFunction>[];
    };
    protected validator: ValidatorLayer;
    protected standaloneValidator: StandaloneValidator;
    event: Partial<LifeCycleStore>;
    protected telemetry: undefined | {
        stack: string | undefined;
    };
    router: {
        '~http': Memoirist<{
            compile: Function;
            handler?: ComposedHandler;
        }> | undefined;
        readonly http: Memoirist<{
            compile: Function;
            handler?: ComposedHandler;
        }>;
        '~dynamic': Memoirist<DynamicHandler> | undefined;
        readonly dynamic: Memoirist<DynamicHandler>;
        static: { [path in string]: { [method in string]: number; }; };
        response: {
            [path: string]: MaybePromise<Response | undefined> | {
                [method: string]: MaybePromise<Response | undefined>;
            };
        };
        history: InternalRoute[];
    };
    protected routeTree: Record<string, number>;
    get routes(): InternalRoute[];
    protected getGlobalRoutes(): InternalRoute[];
    protected getGlobalDefinitions(): {
        typebox: TModule<{}, {}>;
        type: Record<string, TSchema>;
        error: Record<string, Error>;
    };
    protected inference: Sucrose.Inference;
    private getServer;
    private getParent;
    '~parser': {
        [K in string]: BodyHandler<any, any>;
    };
    private _promisedModules;
    private get promisedModules();
    constructor(config?: ElysiaConfig<BasePath>);
    '~adapter': ElysiaAdapter;
    env(model: TObject<any>, _env?: NodeJS.ProcessEnv): this;
    /**
     * @private DO_NOT_USE_OR_YOU_WILL_BE_FIRED
     * @version 1.1.0
     *
     * ! Do not use unless you know exactly what you are doing
     * ? Add Higher order function to Elysia.fetch
     */
    wrap(fn: HigherOrderFunction): this;
    private applyMacro;
    get models(): {
        [K in keyof Definitions['typebox']]: ModelValidator<Definitions['typebox'][K]>;
    } & {
        modules: TModule<Definitions['typebox']>;
    };
    private add;
    private setHeaders?;
    headers(header: Context['set']['headers'] | undefined): this;
    /**
     * ### start | Life cycle event
     * Called after server is ready for serving
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onStart(({ server }) => {
     *         console.log("Running at ${server?.url}:${server?.port}")
     *     })
     *     .listen(3000)
     * ```
     */
    onStart(handler: MaybeArray<GracefulHandler<this>>): this;
    /**
     * ### request | Life cycle event
     * Called on every new request is accepted
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onRequest(({ method, url }) => {
     *         saveToAnalytic({ method, url })
     *     })
     * ```
     */
    onRequest<const Schema extends RouteSchema>(handler: MaybeArray<PreHandler<MergeSchema<Schema, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>>, {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: {};
        resolve: {};
    }>>): this;
    /**
     * ### parse | Life cycle event
     * Callback function to handle body parsing
     *
     * If truthy value is returned, will be assigned to `context.body`
     * Otherwise will skip the callback and look for the next one.
     *
     * Equivalent to Express's body parser
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onParse((request, contentType) => {
     *         if(contentType === "application/json")
     *             return request.json()
     *     })
     * ```
     */
    onParse<const Schema extends RouteSchema>(parser: MaybeArray<BodyHandler<MergeSchema<Schema, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>, BasePath>, {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Singleton['derive'] & Ephemeral['derive'] & Volatile['derive'];
        resolve: {};
    }>>): this;
    /**
     * ### parse | Life cycle event
     * Callback function to handle body parsing
     *
     * If truthy value is returned, will be assigned to `context.body`
     * Otherwise will skip the callback and look for the next one.
     *
     * Equivalent to Express's body parser
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onParse((request, contentType) => {
     *         if(contentType === "application/json")
     *             return request.json()
     *     })
     * ```
     */
    onParse<const Schema extends RouteSchema, const Type extends LifeCycleType>(options: {
        as?: Type;
    }, parser: MaybeArray<BodyHandler<MergeSchema<Schema, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>, BasePath> & 'global' extends Type ? {
        params: Record<string, string>;
    } : 'scoped' extends Type ? {
        params: Record<string, string>;
    } : {}, 'global' extends Type ? {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Singleton['derive'] & Partial<Ephemeral['derive'] & Volatile['derive']>;
        resolve: {};
    } : 'scoped' extends Type ? {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Singleton['derive'] & Ephemeral['derive'] & Partial<Volatile['derive']>;
        resolve: {};
    } : {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Singleton['derive'] & Ephemeral['derive'] & Volatile['derive'];
        resolve: {};
    }>>): this;
    onParse<const Parsers extends keyof Metadata['parser']>(parser: Parsers): this;
    /**
     * ### parse | Life cycle event
     * Callback function to handle body parsing
     *
     * If truthy value is returned, will be assigned to `context.body`
     * Otherwise will skip the callback and look for the next one.
     *
     * Equivalent to Express's body parser
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onParse((request, contentType) => {
     *         if(contentType === "application/json")
     *             return request.json()
     *     })
     * ```
     */
    parser<const Parser extends string, const Schema extends RouteSchema, const Handler extends BodyHandler<MergeSchema<Schema, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>, BasePath>, {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Singleton['derive'] & Ephemeral['derive'] & Volatile['derive'];
        resolve: {};
    }>>(name: Parser, parser: Handler): Elysia<BasePath, Singleton, Definitions, {
        schema: Metadata['schema'];
        standaloneSchema: Metadata['standaloneSchema'];
        macro: Metadata['macro'];
        macroFn: Metadata['macroFn'];
        parser: Metadata['parser'] & {
            [K in Parser]: Handler;
        };
    }, Routes, Ephemeral, Volatile>;
    /**
     * ### transform | Life cycle event
     * Assign or transform anything related to context before validation.
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onTransform(({ params }) => {
     *         if(params.id)
     *             params.id = +params.id
     *     })
     * ```
     */
    onTransform<const Schema extends RouteSchema>(handler: MaybeArray<TransformHandler<MergeSchema<Schema, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>, BasePath>, {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Singleton['derive'] & Ephemeral['derive'] & Volatile['derive'];
        resolve: {};
    }>>): this;
    /**
     * ### transform | Life cycle event
     * Assign or transform anything related to context before validation.
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onTransform(({ params }) => {
     *         if(params.id)
     *             params.id = +params.id
     *     })
     * ```
     */
    onTransform<const Schema extends RouteSchema, const Type extends LifeCycleType>(options: {
        as?: Type;
    }, handler: MaybeArray<TransformHandler<MergeSchema<Schema, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>, BasePath> & 'global' extends Type ? {
        params: Record<string, string>;
    } : 'scoped' extends Type ? {
        params: Record<string, string>;
    } : {}, 'global' extends Type ? {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Singleton['derive'] & Ephemeral['derive'] & Volatile['derive'];
        resolve: {};
    } : 'scoped' extends Type ? {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Singleton['derive'] & Ephemeral['derive'] & Partial<Volatile['derive']>;
        resolve: {};
    } : {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Singleton['derive'] & Partial<Ephemeral['derive'] & Volatile['derive']>;
        resolve: {};
    }>>): this;
    /**
     * Derive new property for each request with access to `Context`.
     *
     * If error is thrown, the scope will skip to handling error instead.
     *
     * ---
     * @example
     * new Elysia()
     *     .state('counter', 1)
     *     .derive(({ store }) => ({
     *         increase() {
     *             store.counter++
     *         }
     *     }))
     */
    resolve<const Resolver extends Record<string, unknown> | ElysiaCustomStatusResponse<any, any, any>, const Type extends LifeCycleType>(options: {
        as?: Type;
    }, resolver: (context: Prettify<Context<MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>, BasePath> & 'global' extends Type ? {
        params: Record<string, string>;
    } : 'scoped' extends Type ? {
        params: Record<string, string>;
    } : {}, Singleton & ('global' extends Type ? {
        derive: Partial<Ephemeral['derive'] & Volatile['derive']>;
        resolve: Partial<Ephemeral['resolve'] & Volatile['resolve']>;
    } : 'scoped' extends Type ? {
        derive: Ephemeral['derive'] & Partial<Volatile['derive']>;
        resolve: Ephemeral['resolve'] & Partial<Volatile['resolve']>;
    } : {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    })>>) => MaybePromise<Resolver | void>): Type extends 'global' ? Elysia<BasePath, {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Singleton['derive'];
        resolve: Prettify<Singleton['resolve'] & ExcludeElysiaResponse<Resolver>>;
    }, Definitions, Metadata, Routes, Ephemeral, Volatile> : Type extends 'scoped' ? Elysia<BasePath, Singleton, Definitions, Metadata, Routes, {
        derive: Ephemeral['derive'];
        resolve: Prettify<Ephemeral['resolve'] & ExcludeElysiaResponse<Resolver>>;
        schema: Ephemeral['schema'];
        standaloneSchema: Ephemeral['standaloneSchema'];
    }, Volatile> : Elysia<BasePath, Singleton, Definitions, Metadata, Routes, Ephemeral, {
        derive: Volatile['derive'];
        resolve: Prettify<Volatile['resolve'] & ExcludeElysiaResponse<Resolver>>;
        schema: Volatile['schema'];
        standaloneSchema: Volatile['standaloneSchema'];
    }>;
    /**
     * Derive new property for each request with access to `Context`.
     *
     * If error is thrown, the scope will skip to handling error instead.
     *
     * ---
     * @example
     * new Elysia()
     *     .state('counter', 1)
     *     .derive(({ store }) => ({
     *         increase() {
     *             store.counter++
     *         }
     *     }))
     */
    resolve<const Resolver extends Record<string, unknown> | ElysiaCustomStatusResponse<any, any, any> | void>(resolver: (context: Prettify<Context<MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>, BasePath>, Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    }, BasePath>>) => MaybePromise<Resolver | void>): Elysia<BasePath, Singleton, Definitions, Metadata, Routes, Ephemeral, {
        derive: Volatile['derive'];
        resolve: Prettify<Volatile['resolve'] & ExcludeElysiaResponse<Resolver>>;
        schema: Volatile['schema'];
        standaloneSchema: Volatile['standaloneSchema'];
    }>;
    mapResolve<const NewResolver extends Record<string, unknown> | ElysiaCustomStatusResponse<any, any, any>>(mapper: (context: Context<MergeSchema<Metadata['schema'], MergeSchema<Ephemeral['schema'], Volatile['schema']>>, Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    }, BasePath>) => MaybePromise<NewResolver | void>): Elysia<BasePath, Singleton, Definitions, Metadata, Routes, Ephemeral, {
        derive: Volatile['derive'];
        resolve: ExcludeElysiaResponse<NewResolver>;
        schema: Volatile['schema'];
        standaloneSchema: Volatile['standaloneSchema'];
    }>;
    mapResolve<const NewResolver extends Record<string, unknown> | ElysiaCustomStatusResponse<any, any, any>, const Type extends LifeCycleType>(options: {
        as?: Type;
    }, mapper: (context: Context<MergeSchema<Metadata['schema'], MergeSchema<Ephemeral['schema'], Volatile['schema']>>, Singleton & ('global' extends Type ? {
        derive: Partial<Ephemeral['derive'] & Volatile['derive']>;
        resolve: Partial<Ephemeral['resolve'] & Volatile['resolve']>;
    } : 'scoped' extends Type ? {
        derive: Ephemeral['derive'] & Partial<Volatile['derive']>;
        resolve: Ephemeral['resolve'] & Partial<Volatile['resolve']>;
    } : {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    })>) => MaybePromise<NewResolver | void>): Type extends 'global' ? Elysia<BasePath, {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Singleton['derive'];
        resolve: ExcludeElysiaResponse<NewResolver>;
    }, Definitions, Metadata, Routes, Ephemeral, Volatile> : Type extends 'scoped' ? Elysia<BasePath, Singleton, Definitions, Metadata, Routes, {
        derive: Ephemeral['derive'];
        resolve: Prettify<Ephemeral['resolve'] & ExcludeElysiaResponse<NewResolver>>;
        schema: Ephemeral['schema'];
        standaloneSchema: Ephemeral['standaloneSchema'];
    }, Volatile> : Elysia<BasePath, Singleton, Definitions, Metadata, Routes, Ephemeral, {
        derive: Volatile['derive'];
        resolve: Prettify<Volatile['resolve'] & ExcludeElysiaResponse<NewResolver>>;
        schema: Volatile['schema'];
        standaloneSchema: Volatile['standaloneSchema'];
    }>;
    /**
     * ### Before Handle | Life cycle event
     * Execute after validation and before the main route handler.
     *
     * If truthy value is returned, will be assigned as `Response` and skip the main handler
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onBeforeHandle(({ params: { id }, status }) => {
     *         if(id && !isExisted(id)) {
     * 	           status(401)
     *
     *             return "Unauthorized"
     * 	       }
     *     })
     * ```
     */
    onBeforeHandle<const Schema extends RouteSchema>(handler: MaybeArray<OptionalHandler<MergeSchema<Schema, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>, BasePath>, Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    }>>): this;
    /**
     * ### Before Handle | Life cycle event
     * Execute after validation and before the main route handler.
     *
     * If truthy value is returned, will be assigned as `Response` and skip the main handler
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onBeforeHandle(({ params: { id }, status }) => {
     *         if(id && !isExisted(id)) {
     * 	           status(401)
     *
     *             return "Unauthorized"
     * 	       }
     *     })
     * ```
     */
    onBeforeHandle<const Schema extends RouteSchema, const Type extends LifeCycleType>(options: {
        as?: Type;
    }, handler: MaybeArray<OptionalHandler<MergeSchema<Schema, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>, BasePath> & 'global' extends Type ? {
        params: Record<string, string>;
    } : 'scoped' extends Type ? {
        params: Record<string, string>;
    } : {}, Singleton & ('global' extends Type ? {
        derive: Partial<Ephemeral['derive'] & Volatile['derive']>;
        resolve: Partial<Ephemeral['resolve'] & Volatile['resolve']>;
    } : 'scoped' extends Type ? {
        derive: Ephemeral['derive'] & Partial<Volatile['derive']>;
        resolve: Ephemeral['resolve'] & Partial<Volatile['resolve']>;
    } : {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    }), BasePath>>): this;
    /**
     * ### After Handle | Life cycle event
     * Intercept request **after** main handler is called.
     *
     * If truthy value is returned, will be assigned as `Response`
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onAfterHandle((context, response) => {
     *         if(typeof response === "object")
     *             return JSON.stringify(response)
     *     })
     * ```
     */
    onAfterHandle<const Schema extends RouteSchema>(handler: MaybeArray<AfterHandler<MergeSchema<Schema, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>, BasePath>, Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    }>>): this;
    /**
     * ### After Handle | Life cycle event
     * Intercept request **after** main handler is called.
     *
     * If truthy value is returned, will be assigned as `Response`
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onAfterHandle((context, response) => {
     *         if(typeof response === "object")
     *             return JSON.stringify(response)
     *     })
     * ```
     */
    onAfterHandle<const Schema extends RouteSchema, const Type extends LifeCycleType>(options: {
        as?: LifeCycleType;
    }, handler: MaybeArray<OptionalHandler<MergeSchema<Schema, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>, BasePath> & 'global' extends Type ? {
        params: Record<string, string>;
    } : 'scoped' extends Type ? {
        params: Record<string, string>;
    } : {}, Singleton & ('global' extends Type ? {
        derive: Partial<Ephemeral['derive'] & Volatile['derive']>;
        resolve: Partial<Ephemeral['resolve'] & Volatile['resolve']>;
    } : 'scoped' extends Type ? {
        derive: Ephemeral['derive'] & Partial<Volatile['derive']>;
        resolve: Ephemeral['resolve'] & Partial<Volatile['resolve']>;
    } : {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    })>>): this;
    /**
     * ### After Handle | Life cycle event
     * Intercept request **after** main handler is called.
     *
     * If truthy value is returned, will be assigned as `Response`
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .mapResponse((context, response) => {
     *         if(typeof response === "object")
     *             return JSON.stringify(response)
     *     })
     * ```
     */
    mapResponse<const Schema extends RouteSchema>(handler: MaybeArray<MapResponse<MergeSchema<Schema, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>, BasePath>, Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    }>>): this;
    /**
     * ### After Handle | Life cycle event
     * Intercept request **after** main handler is called.
     *
     * If truthy value is returned, will be assigned as `Response`
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .mapResponse((context, response) => {
     *         if(typeof response === "object")
     *             return JSON.stringify(response)
     *     })
     * ```
     */
    mapResponse<const Schema extends RouteSchema, Type extends LifeCycleType>(options: {
        as?: Type;
    }, handler: MaybeArray<MapResponse<MergeSchema<Schema, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>, BasePath> & 'global' extends Type ? {
        params: Record<string, string>;
    } : 'scoped' extends Type ? {
        params: Record<string, string>;
    } : {}, Singleton & ('global' extends Type ? {
        derive: Partial<Ephemeral['derive'] & Volatile['derive']>;
        resolve: Partial<Ephemeral['resolve'] & Volatile['resolve']>;
    } : 'scoped' extends Type ? {
        derive: Ephemeral['derive'] & Partial<Volatile['derive']>;
        resolve: Ephemeral['resolve'] & Partial<Volatile['resolve']>;
    } : {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    })>>): this;
    /**
     * ### response | Life cycle event
     * Call AFTER main handler is executed
     * Good for analytic metrics
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onAfterResponse(() => {
     *         cleanup()
     *     })
     * ```
     */
    onAfterResponse<const Schema extends RouteSchema>(handler: MaybeArray<AfterResponseHandler<MergeSchema<Schema, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>, BasePath>, Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    }>>): this;
    /**
     * ### response | Life cycle event
     * Call AFTER main handler is executed
     * Good for analytic metrics
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onAfterResponse(() => {
     *         cleanup()
     * 	   })
     * ```
     */
    onAfterResponse<const Schema extends RouteSchema, const Type extends LifeCycleType>(options: {
        as?: Type;
    }, handler: MaybeArray<AfterResponseHandler<MergeSchema<Schema, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>, BasePath> & 'global' extends Type ? {
        params: Record<string, string>;
    } : 'scoped' extends Type ? {
        params: Record<string, string>;
    } : {}, Singleton & ('global' extends Type ? {
        derive: Partial<Ephemeral['derive'] & Volatile['derive']>;
        resolve: Partial<Ephemeral['resolve'] & Volatile['resolve']>;
    } : 'scoped' extends Type ? {
        derive: Ephemeral['derive'] & Partial<Volatile['derive']>;
        resolve: Ephemeral['resolve'] & Partial<Volatile['resolve']>;
    } : {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    })>>): this;
    /**
     * ### After Handle | Life cycle event
     * Intercept request **after** main handler is called.
     *
     * If truthy value is returned, will be assigned as `Response`
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onAfterHandle((context, response) => {
     *         if(typeof response === "object")
     *             return JSON.stringify(response)
     *     })
     * ```
     */
    trace<const Schema extends RouteSchema>(handler: MaybeArray<TraceHandler<Schema, Singleton>>): this;
    /**
     * ### After Handle | Life cycle event
     * Intercept request **after** main handler is called.
     *
     * If truthy value is returned, will be assigned as `Response`
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onAfterHandle((context, response) => {
     *         if(typeof response === "object")
     *             return JSON.stringify(response)
     *     })
     * ```
     */
    trace<const Schema extends RouteSchema>(options: {
        as?: LifeCycleType;
    }, handler: MaybeArray<TraceHandler<Schema, Singleton>>): this;
    /**
     * Register errors
     *
     * ---
     * @example
     * ```typescript
     * class CustomError extends Error {
     *     constructor() {
     *         super()
     *     }
     * }
     *
     * new Elysia()
     *     .error('CUSTOM_ERROR', CustomError)
     * ```
     */
    error<const Errors extends Record<string, {
        prototype: Error;
    }>>(errors: Errors): Elysia<BasePath, Singleton, {
        typebox: Definitions['typebox'];
        error: Definitions['error'] & {
            [K in keyof Errors]: Errors[K] extends {
                prototype: infer LiteralError extends Error;
            } ? LiteralError : Errors[K];
        };
    }, Metadata, Routes, Ephemeral, Volatile>;
    /**
     * Register errors
     *
     * ---
     * @example
     * ```typescript
     * class CustomError extends Error {
     *     constructor() {
     *         super()
     *     }
     * }
     *
     * new Elysia()
     *     .error({
     *         CUSTOM_ERROR: CustomError
     *     })
     * ```
     */
    error<Name extends string, const CustomError extends {
        prototype: Error;
    }>(name: Name, errors: CustomError): Elysia<BasePath, Singleton, {
        typebox: Definitions['typebox'];
        error: Definitions['error'] & {
            [name in Name]: CustomError extends {
                prototype: infer LiteralError extends Error;
            } ? LiteralError : CustomError;
        };
    }, Metadata, Routes, Ephemeral, Volatile>;
    /**
     * Register errors
     *
     * ---
     * @example
     * ```typescript
     * class CustomError extends Error {
     *     constructor() {
     *         super()
     *     }
     * }
     *
     * new Elysia()
     *     .error('CUSTOM_ERROR', CustomError)
     * ```
     */
    error<const NewErrors extends Record<string, Error>>(mapper: (decorators: Definitions['error']) => NewErrors): Elysia<BasePath, Singleton, {
        typebox: Definitions['typebox'];
        error: {
            [K in keyof NewErrors]: NewErrors[K] extends {
                prototype: infer LiteralError extends Error;
            } ? LiteralError : never;
        };
    }, Metadata, Routes, Ephemeral, Volatile>;
    /**
     * ### Error | Life cycle event
     * Called when error is thrown during processing request
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onError(({ code }) => {
     *         if(code === "NOT_FOUND")
     *             return "Path not found :("
     *     })
     * ```
     */
    onError<const Schema extends RouteSchema>(handler: MaybeArray<ErrorHandler<Definitions['error'], MergeSchema<Schema, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>>, Singleton, Ephemeral, Volatile>>): this;
    /**
     * ### Error | Life cycle event
     * Called when error is thrown during processing request
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onError(({ code }) => {
     *         if(code === "NOT_FOUND")
     *             return "Path not found :("
     *     })
     * ```
     */
    onError<const Schema extends RouteSchema, const Scope extends LifeCycleType>(options: {
        as?: Scope;
    }, handler: MaybeArray<ErrorHandler<Definitions['error'], MergeSchema<Schema, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>>, Scope extends 'global' ? {
        store: Singleton['store'];
        decorator: Singleton['decorator'];
        derive: Singleton['derive'] & Ephemeral['derive'] & Volatile['derive'];
        resolve: Singleton['resolve'] & Ephemeral['resolve'] & Volatile['resolve'];
    } : Scope extends 'scoped' ? {
        store: Singleton['store'];
        decorator: Singleton['decorator'];
        derive: Singleton['derive'] & Ephemeral['derive'];
        resolve: Singleton['resolve'] & Ephemeral['resolve'];
    } : Singleton, Scope extends 'global' ? Ephemeral : {
        derive: Partial<Ephemeral['derive']>;
        resolve: Partial<Ephemeral['resolve']>;
        schema: Ephemeral['schema'];
        standaloneSchema: Ephemeral['standaloneSchema'];
    }, Scope extends 'global' ? Ephemeral : Scope extends 'scoped' ? Ephemeral : {
        derive: Partial<Ephemeral['derive']>;
        resolve: Partial<Ephemeral['resolve']>;
        schema: Ephemeral['schema'];
        standaloneSchema: Ephemeral['standaloneSchema'];
    }>>): this;
    /**
     * ### stop | Life cycle event
     * Called after server stop serving request
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .onStop((app) => {
     *         cleanup()
     *     })
     * ```
     */
    onStop(handler: MaybeArray<GracefulHandler<this>>): this;
    /**
     * ### on
     * Syntax sugar for attaching life cycle event by name
     *
     * Does the exact same thing as `.on[Event]()`
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .on('error', ({ code }) => {
     *         if(code === "NOT_FOUND")
     *             return "Path not found :("
     *     })
     * ```
     */
    on<Event extends keyof LifeCycleStore>(type: Event, handlers: MaybeArray<Extract<LifeCycleStore[Event], HookContainer[]>[0]['fn']>): this;
    /**
     * ### on
     * Syntax sugar for attaching life cycle event by name
     *
     * Does the exact same thing as `.on[Event]()`
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .on('error', ({ code }) => {
     *         if(code === "NOT_FOUND")
     *             return "Path not found :("
     *     })
     * ```
     */
    on<const Event extends keyof LifeCycleStore>(options: {
        as?: LifeCycleType;
    }, type: Event, handlers: MaybeArray<Extract<LifeCycleStore[Event], Function[]>[0]>): this;
    as(type: 'global'): Elysia<BasePath, {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Prettify<Singleton['derive'] & Ephemeral['derive'] & Volatile['derive']>;
        resolve: Prettify<Singleton['resolve'] & Ephemeral['resolve'] & Volatile['resolve']>;
    }, Definitions, {
        schema: MergeSchema<MergeSchema<Volatile['schema'], Ephemeral['schema']>, Metadata['schema']>;
        standaloneSchema: Metadata['standaloneSchema'];
        macro: Metadata['macro'];
        macroFn: Metadata['macroFn'];
        parser: Metadata['parser'];
    }, Routes, {
        derive: {};
        resolve: {};
        schema: {};
        standaloneSchema: {};
    }, {
        derive: {};
        resolve: {};
        schema: {};
        standaloneSchema: {};
    }>;
    as(type: 'scoped'): Elysia<BasePath, Singleton, Definitions, Metadata, Routes, {
        derive: Prettify<Ephemeral['derive'] & Volatile['derive']>;
        resolve: Prettify<Ephemeral['resolve'] & Volatile['resolve']>;
        schema: MergeSchema<Volatile['schema'], Ephemeral['schema']>;
        standaloneSchema: PrettifySchema<Volatile['standaloneSchema'] & Ephemeral['standaloneSchema']>;
    }, {
        derive: {};
        resolve: {};
        schema: {};
        standaloneSchema: {};
    }>;
    group<const Prefix extends string, const NewElysia extends AnyElysia>(prefix: Prefix, run: (group: Elysia<JoinPath<BasePath, Prefix>, Singleton, Definitions, {
        schema: MergeSchema<UnwrapRoute<{}, Definitions['typebox'], JoinPath<BasePath, Prefix>>, Metadata['schema']>;
        standaloneSchema: Prettify<UnwrapRoute<{}, Definitions['typebox'], JoinPath<BasePath, Prefix>> & Metadata['standaloneSchema']>;
        macro: Metadata['macro'];
        macroFn: Metadata['macroFn'];
        parser: Metadata['parser'];
    }, {}, Ephemeral, Volatile>) => NewElysia): Elysia<BasePath, Singleton, Definitions, Metadata, Prettify<Routes & NewElysia['~Routes']>, Ephemeral, Volatile>;
    group<const Prefix extends string, const NewElysia extends AnyElysia, const Input extends InputSchema<keyof Definitions['typebox'] & string>, const Schema extends MergeSchema<UnwrapRoute<Input, Definitions['typebox'], JoinPath<BasePath, Prefix>>, Metadata['schema']>, const Resolutions extends MaybeArray<ResolveHandler<Schema, Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    }>>>(prefix: Prefix, schema: LocalHook<Input, Schema, Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    }, Definitions['error'], Metadata['macro'], keyof Metadata['parser']>, run: (group: Elysia<JoinPath<BasePath, Prefix>, {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Prettify<Singleton['derive'] & Ephemeral['derive'] & Volatile['derive']>;
        resolve: Prettify<Singleton['resolve'] & Ephemeral['resolve'] & Volatile['resolve'] & ResolveResolutions<Resolutions>>;
    }, Definitions, {
        schema: Prettify<Schema>;
        standaloneSchema: Metadata['standaloneSchema'];
        macro: Metadata['macro'];
        macroFn: Metadata['macroFn'];
        parser: Metadata['parser'];
    }, {}, Ephemeral, Volatile>) => NewElysia): Elysia<BasePath, Singleton, Definitions, Metadata, Routes & NewElysia['~Routes'], Ephemeral, Volatile>;
    guard<const LocalSchema extends InputSchema<keyof Definitions['typebox'] & string>, const Schema extends MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], BasePath>, Metadata['schema']>, const Macro extends Metadata['macro'], const MacroContext extends MacroToContext<Metadata['macroFn'], NoInfer<Macro>>, const GuardType extends GuardSchemaType, const AsType extends LifeCycleType>(hook: {
        /**
         * @default 'override'
         */
        as?: AsType;
        /**
         * @default 'standalone'
         * @since 1.3.0
         */
        schema?: GuardType;
    } & LocalHook<LocalSchema, Schema, Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    }, Definitions['error'], Macro, keyof Metadata['parser']>): Or<GuardSchemaType extends GuardType ? true : false, GuardType extends 'override' ? true : false> extends true ? Or<LifeCycleType extends AsType ? true : false, AsType extends 'local' ? true : false> extends true ? Elysia<BasePath, Singleton, Definitions, Metadata, Routes, Ephemeral, {
        derive: Volatile['derive'];
        resolve: Prettify<Volatile['resolve'] & MacroContext>;
        schema: Prettify<MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox']>, Metadata['schema']>>;
        standaloneSchema: Volatile['standaloneSchema'];
    }> : AsType extends 'global' ? Elysia<BasePath, {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Singleton['derive'];
        resolve: Prettify<Singleton['resolve'] & MacroContext>;
    }, Definitions, {
        schema: Prettify<MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], BasePath>, Metadata['schema']>>;
        standaloneSchema: Metadata['standaloneSchema'];
        macro: Metadata['macro'];
        macroFn: Metadata['macroFn'];
        parser: Metadata['parser'];
    }, Routes, Ephemeral, Volatile> : Elysia<BasePath, Singleton, Definitions, Metadata, Routes, {
        derive: Ephemeral['derive'];
        resolve: Prettify<Ephemeral['resolve'] & MacroContext>;
        schema: Prettify<MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox']>, Metadata['schema'] & Ephemeral['schema']>>;
        standaloneSchema: Ephemeral['standaloneSchema'];
    }, Volatile> : Or<LifeCycleType extends AsType ? true : false, AsType extends 'local' ? true : false> extends true ? Elysia<BasePath, Singleton, Definitions, Metadata, Routes, Ephemeral, {
        derive: Volatile['derive'];
        resolve: Prettify<Volatile['resolve'] & MacroContext>;
        schema: Volatile['schema'];
        standaloneSchema: Volatile['standaloneSchema'] & UnwrapRoute<LocalSchema, Definitions['typebox']>;
    }> : AsType extends 'global' ? Elysia<BasePath, {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Singleton['derive'];
        resolve: Prettify<Singleton['resolve'] & MacroContext>;
    }, Definitions, {
        schema: Metadata['schema'];
        standaloneSchema: UnwrapRoute<LocalSchema, Definitions['typebox'], BasePath> & Metadata['standaloneSchema'];
        macro: Metadata['macro'];
        macroFn: Metadata['macroFn'];
        parser: Metadata['parser'];
    }, Routes, Ephemeral, Volatile> : Elysia<BasePath, Singleton, Definitions, Metadata, Routes, {
        derive: Ephemeral['derive'];
        resolve: Prettify<Ephemeral['resolve'] & MacroContext>;
        schema: Ephemeral['schema'];
        standaloneSchema: Ephemeral['standaloneSchema'] & UnwrapRoute<LocalSchema, Definitions['typebox']>;
    }, Volatile>;
    guard<const LocalSchema extends InputSchema<keyof Definitions['typebox'] & string>, const Schema extends MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], BasePath>, Metadata['schema']>, const Macro extends Metadata['macro'], const MacroContext extends MacroToContext<Metadata['macroFn'], NoInfer<Macro>>>(hook: LocalHook<LocalSchema, Schema, Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'] & MacroContext;
    }, Definitions['error'], Macro, keyof Metadata['parser']>): Elysia<BasePath, Singleton, Definitions, Metadata, Routes, Ephemeral, {
        derive: Volatile['derive'];
        resolve: Prettify<Volatile['resolve'] & MacroContext>;
        schema: Prettify<MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], BasePath>, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>>>;
        standaloneSchema: Metadata['standaloneSchema'];
    }>;
    guard<const LocalSchema extends InputSchema<keyof Definitions['typebox'] & string>, const NewElysia extends AnyElysia, const Schema extends MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], BasePath>, Metadata['schema']>, const Macro extends Metadata['macro'], const MacroContext extends MacroToContext<Metadata['macroFn'], NoInfer<Macro>>>(run: (group: Elysia<BasePath, {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Singleton['derive'];
        resolve: Singleton['resolve'] & MacroContext;
    }, Definitions, {
        schema: Prettify<Schema>;
        standaloneSchema: Metadata['standaloneSchema'];
        macro: Metadata['macro'];
        macroFn: Metadata['macroFn'];
        parser: Metadata['parser'];
    }, {}, Ephemeral, Volatile>) => NewElysia): Elysia<BasePath, Singleton, Definitions, Metadata, Prettify<Routes & NewElysia['~Routes']>, Ephemeral, Volatile>;
    guard<const LocalSchema extends InputSchema<keyof Definitions['typebox'] & string>, const NewElysia extends AnyElysia, const Schema extends MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], BasePath>, Metadata['schema']>, const Macro extends Metadata['macro'], const MacroContext extends MacroToContext<Metadata['macroFn'], NoInfer<Macro>>>(schema: LocalHook<LocalSchema, Schema, Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    }, Definitions['error'], Macro, keyof Metadata['parser']>, run: (group: Elysia<BasePath, {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Singleton['derive'];
        resolve: Prettify<Singleton['resolve'] & MacroContext>;
    }, Definitions, {
        schema: Prettify<Schema>;
        standaloneSchema: Metadata['standaloneSchema'];
        macro: Metadata['macro'];
        macroFn: Metadata['macroFn'];
        parser: Metadata['parser'];
    }, {}, Ephemeral, Volatile>) => NewElysia): Elysia<BasePath, Singleton, Definitions, Metadata, Prettify<Routes & NewElysia['~Routes']>, Ephemeral, {
        derive: Volatile['derive'];
        resolve: Prettify<Volatile['resolve'] & MacroContext>;
        schema: Volatile['schema'];
        standaloneSchema: Volatile['standaloneSchema'];
    }>;
    /**
     * Inline fn
     */
    use<const NewElysia extends AnyElysia, const Param extends AnyElysia = this>(plugin: (app: Param) => NewElysia): Elysia<BasePath, Prettify2<Singleton & NewElysia['~Singleton']>, Prettify<Definitions & NewElysia['~Definitions']>, Prettify2<Metadata & NewElysia['~Metadata']>, BasePath extends `` ? Routes & NewElysia['~Routes'] : Routes & CreateEden<BasePath, NewElysia['~Routes']>, Prettify2<Ephemeral & NewElysia['~Ephemeral']>, Prettify2<Volatile & NewElysia['~Volatile']>>;
    /**
     * Inline async fn
     */
    use<const NewElysia extends AnyElysia, const Param extends AnyElysia = this>(plugin: ((app: Param) => Promise<NewElysia>) | Promise<(app: Param) => NewElysia>): Elysia<BasePath, {
        decorator: Prettify<Singleton['decorator'] & Partial<NewElysia['~Singleton']['decorator']>>;
        store: Prettify<Singleton['store'] & Partial<NewElysia['~Singleton']['store']>>;
        derive: Prettify<Singleton['derive'] & Partial<NewElysia['~Singleton']['derive']>>;
        resolve: Prettify<Singleton['resolve'] & Partial<NewElysia['~Singleton']['resolve']>>;
    }, {
        error: Prettify<Definitions['error'] & NewElysia['~Definitions']['error']>;
        typebox: Prettify<Definitions['typebox'] & NewElysia['~Definitions']['typebox']>;
    }, Prettify2<Metadata & NewElysia['~Metadata']>, BasePath extends `` ? Routes & NewElysia['~Routes'] : Routes & CreateEden<BasePath, NewElysia['~Routes']>, {
        schema: Prettify<Ephemeral['schema'] & Partial<NewElysia['~Ephemeral']['schema']>>;
        standaloneSchema: PrettifySchema<Ephemeral['standaloneSchema'] & Partial<NewElysia['~Ephemeral']['standaloneSchema']>>;
        resolve: Prettify<Ephemeral['resolve'] & Partial<NewElysia['~Ephemeral']['resolve']>>;
        derive: Prettify<Ephemeral['derive'] & Partial<NewElysia['~Ephemeral']['derive']>>;
    }, {
        schema: Prettify<Volatile['schema'] & Partial<NewElysia['~Volatile']['schema']>>;
        standaloneSchema: PrettifySchema<Volatile['standaloneSchema'] & Partial<NewElysia['~Volatile']['standaloneSchema']>>;
        resolve: Prettify<Volatile['resolve'] & Partial<NewElysia['~Volatile']['resolve']>>;
        derive: Prettify<Volatile['derive'] & Partial<NewElysia['~Volatile']['derive']>>;
    }>;
    /**
     * Entire Instance
     **/
    use<const NewElysia extends AnyElysia>(instance: MaybePromise<NewElysia>): Elysia<BasePath, Prettify2<Singleton & NewElysia['~Singleton']>, Prettify2<Definitions & NewElysia['~Definitions']>, Prettify2<Metadata & NewElysia['~Metadata']>, BasePath extends `` ? Routes & NewElysia['~Routes'] : Routes & CreateEden<BasePath, NewElysia['~Routes']>, Ephemeral, Prettify2<Volatile & NewElysia['~Ephemeral']>>;
    /**
     * Entire multiple Instance
     **/
    use<const Instances extends AnyElysia[]>(instance: MaybePromise<Instances>): MergeElysiaInstances<Instances, BasePath>;
    /**
     * Import fn
     */
    use<const NewElysia extends AnyElysia>(plugin: Promise<{
        default: (elysia: AnyElysia) => MaybePromise<NewElysia>;
    }>): Elysia<BasePath, Prettify2<Singleton & NewElysia['~Singleton']>, {
        error: Prettify<Definitions['error'] & NewElysia['~Definitions']['error']>;
        typebox: Prettify<Definitions['typebox'] & NewElysia['~Definitions']['typebox']>;
    }, Prettify2<Metadata & NewElysia['~Metadata']>, BasePath extends `` ? Routes & NewElysia['~Routes'] : Routes & CreateEden<BasePath, NewElysia['~Routes']>, Prettify2<Ephemeral & NewElysia['~Ephemeral']>, Prettify2<Volatile & NewElysia['~Volatile']>>;
    /**
     * Import entire instance
     */
    use<const LazyLoadElysia extends AnyElysia>(plugin: Promise<{
        default: LazyLoadElysia;
    }>): Elysia<BasePath, {
        decorator: Prettify<Singleton['decorator'] & Partial<LazyLoadElysia['~Singleton']['decorator']>>;
        store: Prettify<Singleton['store'] & Partial<LazyLoadElysia['~Singleton']['store']>>;
        derive: Prettify<Singleton['derive'] & Partial<LazyLoadElysia['~Singleton']['derive']>>;
        resolve: Prettify<Singleton['resolve'] & Partial<LazyLoadElysia['~Singleton']['resolve']>>;
    }, {
        error: Prettify<Definitions['error'] & LazyLoadElysia['~Definitions']['error']>;
        typebox: Prettify<Definitions['typebox'] & LazyLoadElysia['~Definitions']['typebox']>;
    }, Prettify2<Metadata & LazyLoadElysia['~Metadata']>, BasePath extends `` ? Routes & LazyLoadElysia['~Routes'] : Routes & CreateEden<BasePath, LazyLoadElysia['~Routes']>, Ephemeral, Prettify2<{
        schema: Prettify<Volatile['schema'] & Partial<LazyLoadElysia['~Ephemeral']['schema']>>;
        standaloneSchema: PrettifySchema<Volatile['standaloneSchema'] & Partial<LazyLoadElysia['~Ephemeral']['standaloneSchema']>>;
        resolve: Prettify<Volatile['resolve'] & Partial<LazyLoadElysia['~Ephemeral']['resolve']>>;
        derive: Prettify<Volatile['derive'] & Partial<LazyLoadElysia['~Ephemeral']['derive']>>;
    }>>;
    private propagatePromiseModules;
    private _use;
    macro<const NewMacro extends BaseMacroFn>(macro: (route: MacroManager<MergeSchema<Metadata['schema'], MergeSchema<Ephemeral['schema'], Volatile['schema']>>, Singleton & {
        derive: Partial<Ephemeral['derive'] & Volatile['derive']>;
        resolve: Partial<Ephemeral['resolve'] & Volatile['resolve']>;
    }, Definitions['error']>) => NewMacro): Elysia<BasePath, Singleton, Definitions, {
        schema: Metadata['schema'];
        standaloneSchema: Metadata['standaloneSchema'];
        macro: Metadata['macro'] & Partial<MacroToProperty<NewMacro>>;
        macroFn: Metadata['macroFn'] & NewMacro;
        parser: Metadata['parser'];
    }, Routes, Ephemeral, Volatile>;
    macro<const NewMacro extends HookMacroFn<Metadata['schema'], Singleton & {
        derive: Partial<Ephemeral['derive'] & Volatile['derive']>;
        resolve: Partial<Ephemeral['resolve'] & Volatile['resolve']>;
    }, Definitions['error']>>(macro: NewMacro): Elysia<BasePath, Singleton, Definitions, {
        schema: Metadata['schema'];
        standaloneSchema: Metadata['standaloneSchema'];
        macro: Metadata['macro'] & Partial<MacroToProperty<NewMacro>>;
        macroFn: Metadata['macroFn'] & NewMacro;
        parser: Metadata['parser'];
    }, Routes, Ephemeral, Volatile>;
    mount(handle: ((request: Request) => MaybePromise<Response>) | AnyElysia, detail?: {
        detail?: DocumentDecoration;
    }): this;
    mount(path: string, handle: ((request: Request) => MaybePromise<Response>) | AnyElysia, detail?: {
        detail?: DocumentDecoration;
    }): this;
    /**
     * ### get
     * Register handler for path with method [GET]
     *
     * ---
     * @example
     * ```typescript
     * import { Elysia, t } from 'elysia'
     *
     * new Elysia()
     *     .get('/', () => 'hi')
     *     .get('/with-hook', () => 'hi', {
     *         response: t.String()
     *     })
     * ```
     */
    get<const Path extends string, const LocalSchema extends InputSchema<keyof Definitions['typebox'] & string>, const Schema extends MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], JoinPath<BasePath, Path>>, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>> & Metadata['standaloneSchema'] & Ephemeral['standaloneSchema'] & Volatile['standaloneSchema'], const Macro extends Metadata['macro'], const Decorator extends Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'] & MacroToContext<Metadata['macroFn'], Macro>;
    }, const Handle extends InlineHandler<NoInfer<Schema>, Decorator, JoinPath<BasePath, Path>>>(path: Path, handler: Handle, hook?: LocalHook<LocalSchema, Schema, Decorator, Definitions['error'], Macro, keyof Metadata['parser']>): Elysia<BasePath, Singleton, Definitions, Metadata, Routes & CreateEden<JoinPath<BasePath, Path>, {
        get: {
            body: Schema['body'];
            params: IsNever<keyof Schema['params']> extends true ? ResolvePath<Path> : Schema['params'];
            query: Schema['query'];
            headers: Schema['headers'];
            response: ComposeElysiaResponse<Schema, Handle>;
        };
    }>, Ephemeral, Volatile>;
    /**
     * ### post
     * Register handler for path with method [POST]
     *
     * ---
     * @example
     * ```typescript
     * import { Elysia, t } from 'elysia'
     *
     * new Elysia()
     *     .post('/', () => 'hi')
     *     .post('/with-hook', () => 'hi', {
     *         response: t.String()
     *     })
     * ```
     */
    post<const Path extends string, const LocalSchema extends InputSchema<keyof Definitions['typebox'] & string>, const Schema extends MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], JoinPath<BasePath, Path>>, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>> & Metadata['standaloneSchema'] & Ephemeral['standaloneSchema'] & Volatile['standaloneSchema'], const Macro extends Metadata['macro'], const Decorator extends Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'] & MacroToContext<Metadata['macroFn'], Macro>;
    }, const Handle extends InlineHandler<NoInfer<Schema>, Decorator, JoinPath<BasePath, Path>>>(path: Path, handler: Handle, hook?: LocalHook<LocalSchema, Schema, Decorator, Definitions['error'], Macro, keyof Metadata['parser']>): Elysia<BasePath, Singleton, Definitions, Metadata, Routes & CreateEden<JoinPath<BasePath, Path>, {
        post: {
            body: Schema['body'];
            params: IsNever<keyof Schema['params']> extends true ? ResolvePath<Path> : Schema['params'];
            query: Schema['query'];
            headers: Schema['headers'];
            response: ComposeElysiaResponse<Schema, Handle>;
        };
    }>, Ephemeral, Volatile>;
    /**
     * ### put
     * Register handler for path with method [PUT]
     *
     * ---
     * @example
     * ```typescript
     * import { Elysia, t } from 'elysia'
     *
     * new Elysia()
     *     .put('/', () => 'hi')
     *     .put('/with-hook', () => 'hi', {
     *         response: t.String()
     *     })
     * ```
     */
    put<const Path extends string, const LocalSchema extends InputSchema<keyof Definitions['typebox'] & string>, const Schema extends MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], JoinPath<BasePath, Path>>, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>> & Metadata['standaloneSchema'] & Ephemeral['standaloneSchema'] & Volatile['standaloneSchema'], const Macro extends Metadata['macro'], const Decorator extends Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'] & MacroToContext<Metadata['macroFn'], Macro>;
    }, const Handle extends InlineHandler<NoInfer<Schema>, Decorator, JoinPath<BasePath, Path>>>(path: Path, handler: Handle, hook?: LocalHook<LocalSchema, Schema, Decorator, Definitions['error'], Macro, keyof Metadata['parser']>): Elysia<BasePath, Singleton, Definitions, Metadata, Routes & CreateEden<JoinPath<BasePath, Path>, {
        put: {
            body: Schema['body'];
            params: IsNever<keyof Schema['params']> extends true ? ResolvePath<Path> : Schema['params'];
            query: Schema['query'];
            headers: Schema['headers'];
            response: ComposeElysiaResponse<Schema, Handle>;
        };
    }>, Ephemeral, Volatile>;
    /**
     * ### patch
     * Register handler for path with method [PATCH]
     *
     * ---
     * @example
     * ```typescript
     * import { Elysia, t } from 'elysia'
     *
     * new Elysia()
     *     .patch('/', () => 'hi')
     *     .patch('/with-hook', () => 'hi', {
     *         response: t.String()
     *     })
     * ```
     */
    patch<const Path extends string, const LocalSchema extends InputSchema<keyof Definitions['typebox'] & string>, const Schema extends MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], JoinPath<BasePath, Path>>, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>> & Metadata['standaloneSchema'] & Ephemeral['standaloneSchema'] & Volatile['standaloneSchema'], const Macro extends Metadata['macro'], const Decorator extends Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'] & MacroToContext<Metadata['macroFn'], Macro>;
    }, const Handle extends InlineHandler<NoInfer<Schema>, Decorator, JoinPath<BasePath, Path>>>(path: Path, handler: Handle, hook?: LocalHook<LocalSchema, Schema, Decorator, Definitions['error'], Macro, keyof Metadata['parser']>): Elysia<BasePath, Singleton, Definitions, Metadata, Routes & CreateEden<JoinPath<BasePath, Path>, {
        patch: {
            body: Schema['body'];
            params: IsNever<keyof Schema['params']> extends true ? ResolvePath<Path> : Schema['params'];
            query: Schema['query'];
            headers: Schema['headers'];
            response: ComposeElysiaResponse<Schema, Handle>;
        };
    }>, Ephemeral, Volatile>;
    /**
     * ### delete
     * Register handler for path with method [DELETE]
     *
     * ---
     * @example
     * ```typescript
     * import { Elysia, t } from 'elysia'
     *
     * new Elysia()
     *     .delete('/', () => 'hi')
     *     .delete('/with-hook', () => 'hi', {
     *         response: t.String()
     *     })
     * ```
     */
    delete<const Path extends string, const LocalSchema extends InputSchema<keyof Definitions['typebox'] & string>, const Schema extends MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], JoinPath<BasePath, Path>>, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>> & Metadata['standaloneSchema'] & Ephemeral['standaloneSchema'] & Volatile['standaloneSchema'], const Macro extends Metadata['macro'], const Decorator extends Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'] & MacroToContext<Metadata['macroFn'], Macro>;
    }, const Handle extends InlineHandler<NoInfer<Schema>, Decorator, JoinPath<BasePath, Path>>>(path: Path, handler: Handle, hook?: LocalHook<LocalSchema, Schema, Decorator, Definitions['error'], Macro, keyof Metadata['parser']>): Elysia<BasePath, Singleton, Definitions, Metadata, Routes & CreateEden<JoinPath<BasePath, Path>, {
        delete: {
            body: Schema['body'];
            params: IsNever<keyof Schema['params']> extends true ? ResolvePath<Path> : Schema['params'];
            query: Schema['query'];
            headers: Schema['headers'];
            response: ComposeElysiaResponse<Schema, Handle>;
        };
    }>, Ephemeral, Volatile>;
    /**
     * ### options
     * Register handler for path with method [POST]
     *
     * ---
     * @example
     * ```typescript
     * import { Elysia, t } from 'elysia'
     *
     * new Elysia()
     *     .options('/', () => 'hi')
     *     .options('/with-hook', () => 'hi', {
     *         response: t.String()
     *     })
     * ```
     */
    options<const Path extends string, const LocalSchema extends InputSchema<keyof Definitions['typebox'] & string>, const Schema extends MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], JoinPath<BasePath, Path>>, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>> & Metadata['standaloneSchema'] & Ephemeral['standaloneSchema'] & Volatile['standaloneSchema'], const Macro extends Metadata['macro'], const Decorator extends Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'] & MacroToContext<Metadata['macroFn'], Macro>;
    }, const Handle extends InlineHandler<NoInfer<Schema>, Decorator, JoinPath<BasePath, Path>>>(path: Path, handler: Handle, hook?: LocalHook<LocalSchema, Schema, Decorator, Definitions['error'], Macro, keyof Metadata['parser']>): Elysia<BasePath, Singleton, Definitions, Metadata, Routes & CreateEden<JoinPath<BasePath, Path>, {
        options: {
            body: Schema['body'];
            params: IsNever<keyof Schema['params']> extends true ? ResolvePath<Path> : Schema['params'];
            query: Schema['query'];
            headers: Schema['headers'];
            response: ComposeElysiaResponse<Schema, Handle>;
        };
    }>, Ephemeral, Volatile>;
    /**
     * ### all
     * Register handler for path with method [ALL]
     *
     * ---
     * @example
     * ```typescript
     * import { Elysia, t } from 'elysia'
     *
     * new Elysia()
     *     .all('/', () => 'hi')
     *     .all('/with-hook', () => 'hi', {
     *         response: t.String()
     *     })
     * ```
     */
    all<const Path extends string, const LocalSchema extends InputSchema<keyof Definitions['typebox'] & string>, const Schema extends MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], JoinPath<BasePath, Path>>, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>> & Metadata['standaloneSchema'] & Ephemeral['standaloneSchema'] & Volatile['standaloneSchema'], const Macro extends Metadata['macro'], const Decorator extends Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'] & MacroToContext<Metadata['macroFn'], Macro>;
    }, const Handle extends InlineHandler<NoInfer<Schema>, Decorator, JoinPath<BasePath, Path>>>(path: Path, handler: Handle, hook?: LocalHook<LocalSchema, Schema, Decorator, Definitions['error'], Macro, keyof Metadata['parser']>): Elysia<BasePath, Singleton, Definitions, Metadata, Routes & CreateEden<JoinPath<BasePath, Path>, {
        [method in string]: {
            body: Schema['body'];
            params: IsNever<keyof Schema['params']> extends true ? ResolvePath<Path> : Schema['params'];
            query: Schema['query'];
            headers: Schema['headers'];
            response: ComposeElysiaResponse<Schema, Handle>;
        };
    }>, Ephemeral, Volatile>;
    /**
     * ### head
     * Register handler for path with method [HEAD]
     *
     * ---
     * @example
     * ```typescript
     * import { Elysia, t } from 'elysia'
     *
     * new Elysia()
     *     .head('/', () => 'hi')
     *     .head('/with-hook', () => 'hi', {
     *         response: t.String()
     *     })
     * ```
     */
    head<const Path extends string, const LocalSchema extends InputSchema<keyof Definitions['typebox'] & string>, const Schema extends MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], JoinPath<BasePath, Path>>, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>> & Metadata['standaloneSchema'] & Ephemeral['standaloneSchema'] & Volatile['standaloneSchema'], const Macro extends Metadata['macro'], const Decorator extends Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'] & MacroToContext<Metadata['macroFn'], Macro>;
    }, const Handle extends InlineHandler<NoInfer<Schema>, Decorator, JoinPath<BasePath, Path>>>(path: Path, handler: Handle, hook?: LocalHook<LocalSchema, Schema, Decorator, Definitions['error'], Macro, keyof Metadata['parser']>): Elysia<BasePath, Singleton, Definitions, Metadata, Routes & CreateEden<JoinPath<BasePath, Path>, {
        head: {
            body: Schema['body'];
            params: IsNever<keyof Schema['params']> extends true ? ResolvePath<Path> : Schema['params'];
            query: Schema['query'];
            headers: Schema['headers'];
            response: ComposeElysiaResponse<Schema, Handle>;
        };
    }>, Ephemeral, Volatile>;
    /**
     * ### connect
     * Register handler for path with method [CONNECT]
     *
     * ---
     * @example
     * ```typescript
     * import { Elysia, t } from 'elysia'
     *
     * new Elysia()
     *     .connect('/', () => 'hi')
     *     .connect('/with-hook', () => 'hi', {
     *         response: t.String()
     *     })
     * ```
     */
    connect<const Path extends string, const LocalSchema extends InputSchema<keyof Definitions['typebox'] & string>, const Schema extends MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], JoinPath<BasePath, Path>>, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>> & Metadata['standaloneSchema'] & Ephemeral['standaloneSchema'] & Volatile['standaloneSchema'], const Macro extends Metadata['macro'], const Decorator extends Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'] & MacroToContext<Metadata['macroFn'], Macro>;
    }, const Handle extends InlineHandler<NoInfer<Schema>, Decorator, JoinPath<BasePath, Path>>>(path: Path, handler: Handle, hook?: LocalHook<LocalSchema, Schema, Decorator, Definitions['error'], Macro, keyof Metadata['parser']>): Elysia<BasePath, Singleton, Definitions, Metadata, Routes & CreateEden<JoinPath<BasePath, Path>, {
        connect: {
            body: Schema['body'];
            params: IsNever<keyof Schema['params']> extends true ? ResolvePath<Path> : Schema['params'];
            query: Schema['query'];
            headers: Schema['headers'];
            response: ComposeElysiaResponse<Schema, Handle>;
        };
    }>, Ephemeral, Volatile>;
    /**
     * ### route
     * Register handler for path with method [ROUTE]
     *
     * ---
     * @example
     * ```typescript
     * import { Elysia, t } from 'elysia'
     *
     * new Elysia()
     *     .route('/', () => 'hi')
     *     .route('/with-hook', () => 'hi', {
     *         response: t.String()
     *     })
     * ```
     */
    route<const Method extends HTTPMethod, const Path extends string, const LocalSchema extends InputSchema<keyof Definitions['typebox'] & string>, const Schema extends MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], JoinPath<BasePath, Path>>, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>> & Metadata['standaloneSchema'] & Ephemeral['standaloneSchema'] & Volatile['standaloneSchema'], const Macro extends Metadata['macro'], const Decorator extends Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'] & MacroToContext<Metadata['macroFn'], Macro>;
    }, const Handle extends InlineHandler<NoInfer<Schema>, Decorator, JoinPath<BasePath, Path>>>(method: Method, path: Path, handler: Handle, hook?: LocalHook<LocalSchema, Schema, Decorator, Definitions['error'], Macro, keyof Metadata['parser']> & {
        config?: {
            allowMeta?: boolean;
            mount?: Function;
        };
    }): Elysia<BasePath, Singleton, Definitions, Metadata, Routes & CreateEden<JoinPath<BasePath, Path>, {
        [method in Method]: {
            body: Schema['body'];
            params: IsNever<keyof Schema['params']> extends true ? ResolvePath<Path> : Schema['params'];
            query: Schema['query'];
            headers: Schema['headers'];
            response: ComposeElysiaResponse<Schema, Handle>;
        };
    }>, Ephemeral, Volatile>;
    /**
     * ### ws
     * Register handler for path with method [ws]
     *
     * ---
     * @example
     * ```typescript
     * import { Elysia, t } from 'elysia'
     *
     * new Elysia()
     *     .ws('/', {
     *         message(ws, message) {
     *             ws.send(message)
     *         }
     *     })
     * ```
     */
    ws<const Path extends string, const LocalSchema extends InputSchema<keyof Definitions['typebox'] & string>, const Schema extends MergeSchema<UnwrapRoute<LocalSchema, Definitions['typebox'], JoinPath<BasePath, Path>>, MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>>>, const Macro extends Metadata['macro']>(path: Path, options: WSLocalHook<LocalSchema, Schema, Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'] & MacroToContext<Metadata['macroFn'], Macro>;
    }, Macro>): Elysia<BasePath, Singleton, Definitions, Metadata, Routes & CreateEden<JoinPath<BasePath, Path>, {
        subscribe: {
            body: Schema['body'];
            params: IsNever<keyof Schema['params']> extends true ? ResolvePath<Path> : Schema['params'];
            query: Schema['query'];
            headers: Schema['headers'];
            response: {} extends Schema['response'] ? unknown : Schema['response'] extends {
                [200]: any;
            } ? Schema['response'][200] : unknown;
        };
    }>, Ephemeral, Volatile>;
    /**
     * ### state
     * Assign global mutatable state accessible for all handler
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .state('counter', 0)
     *     .get('/', (({ counter }) => ++counter)
     * ```
     */
    state<const Name extends string | number | symbol, Value>(name: Name, value: Value): Elysia<BasePath, {
        decorator: Singleton['decorator'];
        store: Prettify<Singleton['store'] & {
            [name in Name]: Value;
        }>;
        derive: Singleton['derive'];
        resolve: Singleton['resolve'];
    }, Definitions, Metadata, Routes, Ephemeral, Volatile>;
    /**
     * ### state
     * Assign global mutatable state accessible for all handler
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .state({ counter: 0 })
     *     .get('/', (({ counter }) => ++counter)
     * ```
     */
    state<Store extends Record<string, unknown>>(store: Store): Elysia<BasePath, {
        decorator: Singleton['decorator'];
        store: Prettify<Singleton['store'] & Store>;
        derive: Singleton['derive'];
        resolve: Singleton['resolve'];
    }, Definitions, Metadata, Routes, Ephemeral, Volatile>;
    /**
     * ### state
     * Assign global mutatable state accessible for all handler
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .state('counter', 0)
     *     .get('/', (({ counter }) => ++counter)
     * ```
     */
    state<const Type extends ContextAppendType, const Name extends string | number | symbol, Value>(options: {
        as: Type;
    }, name: Name, value: Value): Elysia<BasePath, {
        decorator: Singleton['decorator'];
        store: Type extends 'override' ? Reconcile<Singleton['store'], {
            [name in Name]: Value;
        }, true> : Prettify<Singleton['store'] & {
            [name in Name]: Value;
        }>;
        derive: Singleton['derive'];
        resolve: Singleton['resolve'];
    }, Definitions, Metadata, Routes, Ephemeral, Volatile>;
    /**
     * ### state
     * Assign global mutatable state accessible for all handler
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .state({ counter: 0 })
     *     .get('/', (({ counter }) => ++counter)
     * ```
     */
    state<const Type extends ContextAppendType, Store extends Record<string, unknown>>(options: {
        as: Type;
    }, store: Store): Elysia<BasePath, {
        decorator: Singleton['decorator'];
        store: Type extends 'override' ? Reconcile<Singleton['store'], Store> : Prettify<Singleton['store'] & Store>;
        derive: Singleton['derive'];
        resolve: Singleton['resolve'];
    }, Definitions, Metadata, Routes, Ephemeral, Volatile>;
    state<NewStore extends Record<string, unknown>>(mapper: (decorators: Singleton['store']) => NewStore): Elysia<BasePath, {
        decorator: Singleton['decorator'];
        store: NewStore;
        derive: Singleton['derive'];
        resolve: Singleton['resolve'];
    }, Definitions, Metadata, Routes, Ephemeral, Volatile>;
    /**
     * ### decorate
     * Define custom method to `Context` accessible for all handler
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .decorate('getDate', () => Date.now())
     *     .get('/', (({ getDate }) => getDate())
     * ```
     */
    decorate<const Name extends string, Value>(name: Name, value: Value): Elysia<BasePath, {
        decorator: Prettify<Singleton['decorator'] & {
            [name in Name]: Value;
        }>;
        store: Singleton['store'];
        derive: Singleton['derive'];
        resolve: Singleton['resolve'];
    }, Definitions, Metadata, Routes, Ephemeral, Volatile>;
    /**
     * ### decorate
     * Define custom method to `Context` accessible for all handler
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .decorate('getDate', () => Date.now())
     *     .get('/', (({ getDate }) => getDate())
     * ```
     */
    decorate<NewDecorators extends Record<string, unknown>>(decorators: NewDecorators): Elysia<BasePath, {
        decorator: Prettify<Singleton['decorator'] & NewDecorators>;
        store: Singleton['store'];
        derive: Singleton['derive'];
        resolve: Singleton['resolve'];
    }, Definitions, Metadata, Routes, Ephemeral, Volatile>;
    decorate<NewDecorators extends Record<string, unknown>>(mapper: (decorators: Singleton['decorator']) => NewDecorators): Elysia<BasePath, {
        decorator: NewDecorators;
        store: Singleton['store'];
        derive: Singleton['derive'];
        resolve: Singleton['resolve'];
    }, Definitions, Metadata, Routes, Ephemeral, Volatile>;
    /**
     * ### decorate
     * Define custom method to `Context` accessible for all handler
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .decorate({ as: 'override' }, 'getDate', () => Date.now())
     *     .get('/', (({ getDate }) => getDate())
     * ```
     */
    decorate<const Type extends ContextAppendType, const Name extends string, Value>(options: {
        as: Type;
    }, name: Name, value: Value): Elysia<BasePath, {
        decorator: Type extends 'override' ? Reconcile<Singleton['decorator'], {
            [name in Name]: Value;
        }, true> : Prettify<Singleton['decorator'] & {
            [name in Name]: Value;
        }>;
        store: Singleton['store'];
        derive: Singleton['derive'];
        resolve: Singleton['resolve'];
    }, Definitions, Metadata, Routes, Ephemeral, Volatile>;
    /**
     * ### decorate
     * Define custom method to `Context` accessible for all handler
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .decorate('getDate', () => Date.now())
     *     .get('/', (({ getDate }) => getDate())
     * ```
     */
    decorate<const Type extends ContextAppendType, NewDecorators extends Record<string, unknown>>(options: {
        as: Type;
    }, decorators: NewDecorators): Elysia<BasePath, {
        decorator: Type extends 'override' ? Reconcile<Singleton['decorator'], NewDecorators, true> : Prettify<Singleton['decorator'] & NewDecorators>;
        store: Singleton['store'];
        derive: Singleton['derive'];
        resolve: Singleton['resolve'];
    }, Definitions, Metadata, Routes, Ephemeral, Volatile>;
    /**
     * Derive new property for each request with access to `Context`.
     *
     * If error is thrown, the scope will skip to handling error instead.
     *
     * ---
     * @example
     * new Elysia()
     *     .state('counter', 1)
     *     .derive(({ store }) => ({
     *         increase() {
     *             store.counter++
     *         }
     *     }))
     */
    derive<const Derivative extends Record<string, unknown> | ElysiaCustomStatusResponse<any, any, any> | void>(transform: (context: Prettify<Context<MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>, BasePath>, Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    }>>) => MaybePromise<Derivative>): Elysia<BasePath, Singleton, Definitions, Metadata, Routes, Ephemeral, {
        derive: Prettify<Volatile['derive'] & ExcludeElysiaResponse<Derivative>>;
        resolve: Volatile['resolve'];
        schema: Volatile['schema'];
        standaloneSchema: Volatile['standaloneSchema'];
    }>;
    /**
     * Derive new property for each request with access to `Context`.
     *
     * If error is thrown, the scope will skip to handling error instead.
     *
     * ---
     * @example
     * new Elysia()
     *     .state('counter', 1)
     *     .derive(({ store }) => ({
     *         increase() {
     *             store.counter++
     *         }
     *     }))
     */
    derive<const Derivative extends Record<string, unknown> | ElysiaCustomStatusResponse<any, any, any> | void, const Type extends LifeCycleType>(options: {
        as?: Type;
    }, transform: (context: Prettify<Context<MergeSchema<Volatile['schema'], MergeSchema<Ephemeral['schema'], Metadata['schema']>, BasePath> & 'global' extends Type ? {
        params: Record<string, string>;
    } : 'scoped' extends Type ? {
        params: Record<string, string>;
    } : {}, Singleton & ('global' extends Type ? {
        derive: Partial<Ephemeral['derive'] & Volatile['derive']>;
        resolve: Partial<Ephemeral['resolve'] & Volatile['resolve']>;
    } : 'scoped' extends Type ? {
        derive: Ephemeral['derive'] & Partial<Volatile['derive']>;
        resolve: Ephemeral['resolve'] & Partial<Volatile['resolve']>;
    } : {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    }), BasePath>>) => MaybePromise<Derivative>): Type extends 'global' ? Elysia<BasePath, {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Prettify<Singleton['derive'] & ExcludeElysiaResponse<Derivative>>;
        resolve: Singleton['resolve'];
    }, Definitions, Metadata, Routes, Ephemeral, Volatile> : Type extends 'scoped' ? Elysia<BasePath, Singleton, Definitions, Metadata, Routes, {
        derive: Prettify<Ephemeral['derive'] & ExcludeElysiaResponse<Derivative>>;
        resolve: Ephemeral['resolve'];
        schema: Ephemeral['schema'];
        standaloneSchema: Ephemeral['standaloneSchema'];
    }, Volatile> : Elysia<BasePath, Singleton, Definitions, Metadata, Routes, Ephemeral, {
        derive: Prettify<Volatile['derive'] & ExcludeElysiaResponse<Derivative>>;
        resolve: Ephemeral['resolve'];
        schema: Volatile['schema'];
        standaloneSchema: Volatile['standaloneSchema'];
    }>;
    model<const Name extends string, const Model extends TSchema>(name: Name, model: Model): Elysia<BasePath, Singleton, {
        typebox: Definitions['typebox'] & {
            [name in Name]: Model;
        };
        error: Definitions['error'];
    }, Metadata, Routes, Ephemeral, Volatile>;
    model<const Recorder extends TProperties>(record: Recorder): Elysia<BasePath, Singleton, {
        typebox: Definitions['typebox'] & Recorder;
        error: Definitions['error'];
    }, Metadata, Routes, Ephemeral, Volatile>;
    model<const NewType extends Record<string, TSchema>>(mapper: (decorators: Definitions['typebox'] extends infer Models extends Record<string, TSchema> ? {
        [type in keyof Models]: TRef<// @ts-ignore
        type>;
    } : {}) => NewType): Elysia<BasePath, Singleton, {
        typebox: {
            [key in keyof NewType]: NewType[key] extends TRef<key & string> ? Definitions['typebox'][key] : NewType[key];
        };
        type: {
            [x in keyof NewType]: Static<NewType[x]>;
        };
        error: Definitions['error'];
    }, Metadata, Routes, Ephemeral, Volatile>;
    Ref<K extends keyof Definitions['typebox'] & string>(key: K): TRef<K>;
    mapDerive<const NewDerivative extends Record<string, unknown> | ElysiaCustomStatusResponse<any, any, any>>(mapper: (context: Context<{}, Singleton & {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    }, BasePath>) => MaybePromise<NewDerivative>): Elysia<BasePath, Singleton, Definitions, Metadata, Routes, Ephemeral, {
        derive: ExcludeElysiaResponse<NewDerivative>;
        resolve: Volatile['resolve'];
        schema: Volatile['schema'];
        standaloneSchema: Volatile['standaloneSchema'];
    }>;
    mapDerive<const NewDerivative extends Record<string, unknown> | ElysiaCustomStatusResponse<any, any, any>, const Type extends LifeCycleType>(options: {
        as?: Type;
    }, mapper: (context: Context<{}, Singleton & ('global' extends Type ? {
        derive: Partial<Ephemeral['derive'] & Volatile['derive']>;
        resolve: Partial<Ephemeral['resolve'] & Volatile['resolve']>;
    } : 'scoped' extends Type ? {
        derive: Ephemeral['derive'] & Partial<Volatile['derive']>;
        resolve: Ephemeral['resolve'] & Partial<Volatile['resolve']>;
    } : {
        derive: Ephemeral['derive'] & Volatile['derive'];
        resolve: Ephemeral['resolve'] & Volatile['resolve'];
    }), BasePath>) => MaybePromise<NewDerivative>): Type extends 'global' ? Elysia<BasePath, {
        decorator: Singleton['decorator'];
        store: Singleton['store'];
        derive: Singleton['derive'];
        resolve: Prettify<Singleton['resolve'] & ExcludeElysiaResponse<NewDerivative>>;
    }, Definitions, Metadata, Routes, Ephemeral, Volatile> : Type extends 'scoped' ? Elysia<BasePath, Singleton, Definitions, Metadata, Routes, {
        derive: Ephemeral['derive'];
        resolve: Prettify<Ephemeral['resolve'] & ExcludeElysiaResponse<NewDerivative>>;
        schema: Ephemeral['schema'];
        standaloneSchema: Ephemeral['standaloneSchema'];
    }, Volatile> : Elysia<BasePath, Singleton, Definitions, Metadata, Routes, Ephemeral, {
        derive: Volatile['derive'];
        resolve: Prettify<Volatile['resolve'] & ExcludeElysiaResponse<NewDerivative>>;
        schema: Volatile['schema'];
        standaloneSchema: Volatile['standaloneSchema'];
    }>;
    affix<const Base extends 'prefix' | 'suffix', const Type extends 'all' | 'decorator' | 'state' | 'model' | 'error', const Word extends string>(base: Base, type: Type, word: Word): Elysia<BasePath, {
        decorator: Type extends 'decorator' | 'all' ? 'prefix' extends Base ? Word extends `${string}${'_' | '-' | ' '}` ? AddPrefix<Word, Singleton['decorator']> : AddPrefixCapitalize<Word, Singleton['decorator']> : AddSuffixCapitalize<Word, Singleton['decorator']> : Singleton['decorator'];
        store: Type extends 'state' | 'all' ? 'prefix' extends Base ? Word extends `${string}${'_' | '-' | ' '}` ? AddPrefix<Word, Singleton['store']> : AddPrefixCapitalize<Word, Singleton['store']> : AddSuffix<Word, Singleton['store']> : Singleton['store'];
        derive: Type extends 'decorator' | 'all' ? 'prefix' extends Base ? Word extends `${string}${'_' | '-' | ' '}` ? AddPrefix<Word, Singleton['derive']> : AddPrefixCapitalize<Word, Singleton['derive']> : AddSuffixCapitalize<Word, Singleton['derive']> : Singleton['derive'];
        resolve: Type extends 'decorator' | 'all' ? 'prefix' extends Base ? Word extends `${string}${'_' | '-' | ' '}` ? AddPrefix<Word, Singleton['resolve']> : AddPrefixCapitalize<Word, Singleton['resolve']> : AddSuffixCapitalize<Word, Singleton['resolve']> : Singleton['resolve'];
    }, {
        typebox: Type extends 'model' | 'all' ? 'prefix' extends Base ? Word extends `${string}${'_' | '-' | ' '}` ? AddPrefix<Word, Definitions['typebox']> : AddPrefixCapitalize<Word, Definitions['typebox']> : AddSuffixCapitalize<Word, Definitions['typebox']> : Definitions['typebox'];
        error: Type extends 'error' | 'all' ? 'prefix' extends Base ? Word extends `${string}${'_' | '-' | ' '}` ? AddPrefix<Word, Definitions['error']> : AddPrefixCapitalize<Word, Definitions['error']> : AddSuffixCapitalize<Word, Definitions['error']> : Definitions['error'];
    }, Metadata, Routes, Ephemeral, Volatile>;
    prefix<const Type extends 'all' | 'decorator' | 'state' | 'model' | 'error', const Word extends string>(type: Type, word: Word): Elysia<BasePath, {
        decorator: Type extends "decorator" | "all" ? Word extends `${string} ` | `${string}-` | `${string}_` ? AddPrefix<Word, Singleton["decorator"]> : AddPrefixCapitalize<Word, Singleton["decorator"]> : Singleton["decorator"];
        store: Type extends "all" | "state" ? Word extends `${string} ` | `${string}-` | `${string}_` ? AddPrefix<Word, Singleton["store"]> : AddPrefixCapitalize<Word, Singleton["store"]> : Singleton["store"];
        derive: Type extends "decorator" | "all" ? Word extends `${string} ` | `${string}-` | `${string}_` ? AddPrefix<Word, Singleton["derive"]> : AddPrefixCapitalize<Word, Singleton["derive"]> : Singleton["derive"];
        resolve: Type extends "decorator" | "all" ? Word extends `${string} ` | `${string}-` | `${string}_` ? AddPrefix<Word, Singleton["resolve"]> : AddPrefixCapitalize<Word, Singleton["resolve"]> : Singleton["resolve"];
    }, {
        typebox: Type extends "all" | "model" ? Word extends `${string} ` | `${string}-` | `${string}_` ? AddPrefix<Word, Definitions["typebox"]> : AddPrefixCapitalize<Word, Definitions["typebox"]> : Definitions["typebox"];
        error: Type extends "error" | "all" ? Word extends `${string} ` | `${string}-` | `${string}_` ? AddPrefix<Word, Definitions["error"]> : AddPrefixCapitalize<Word, Definitions["error"]> : Definitions["error"];
    }, Metadata, Routes, Ephemeral, Volatile>;
    suffix<const Type extends 'all' | 'decorator' | 'state' | 'model' | 'error', const Word extends string>(type: Type, word: Word): Elysia<BasePath, {
        decorator: Type extends "decorator" | "all" ? AddSuffixCapitalize<Word, Singleton["decorator"]> : Singleton["decorator"];
        store: Type extends "all" | "state" ? AddSuffix<Word, Singleton["store"]> : Singleton["store"];
        derive: Type extends "decorator" | "all" ? AddSuffixCapitalize<Word, Singleton["derive"]> : Singleton["derive"];
        resolve: Type extends "decorator" | "all" ? AddSuffixCapitalize<Word, Singleton["resolve"]> : Singleton["resolve"];
    }, {
        typebox: Type extends "all" | "model" ? AddSuffixCapitalize<Word, Definitions["typebox"]> : Definitions["typebox"];
        error: Type extends "error" | "all" ? AddSuffixCapitalize<Word, Definitions["error"]> : Definitions["error"];
    }, Metadata, Routes, Ephemeral, Volatile>;
    compile(): this;
    handle: (request: Request) => Promise<Response>;
    /**
     * Use handle can be either sync or async to save performance.
     *
     * Beside benchmark purpose, please use 'handle' instead.
     */
    fetch: (request: Request) => MaybePromise<Response>;
    /**
     * Custom handle written by adapter
     */
    protected _handle?(...a: unknown[]): unknown;
    protected handleError: (context: Partial<Context<MergeSchema<Metadata["schema"], MergeSchema<Ephemeral["schema"], Volatile["schema"]>>, Singleton & {
        derive: Ephemeral["derive"] & Volatile["derive"];
        resolve: Ephemeral["resolve"] & Volatile["resolve"];
    }, BasePath>> & {
        request: Request;
    }, error: Error | ValidationError | ParseError | NotFoundError | InternalServerError) => Promise<any>;
    /**
     * ### listen
     * Assign current instance to port and start serving
     *
     * ---
     * @example
     * ```typescript
     * new Elysia()
     *     .get("/", () => 'hi')
     *     .listen(3000)
     * ```
     */
    listen: (options: string | number | Partial<Serve>, callback?: ListenCallback) => this;
    /**
     * ### stop
     * Stop server from serving
     *
     * ---
     * @example
     * ```typescript
     * const app = new Elysia()
     *     .get("/", () => 'hi')
     *     .listen(3000)
     *
     * // Sometime later
     * app.stop()
     * ```
     *
     * @example
     * ```typescript
     * const app = new Elysia()
     *     .get("/", () => 'hi')
     *     .listen(3000)
     *
     * app.stop(true) // Abruptly any requests inflight
     * ```
     */
    stop: (closeActiveConnections?: boolean) => Promise<void>;
    /**
     * Wait until all lazy loaded modules all load is fully
     */
    get modules(): PromiseGroup;
}
export { Elysia };
export { t } from './type-system';
export { serializeCookie, Cookie, type CookieOptions } from './cookies';
export type { Context, PreContext, ErrorContext } from './context';
export { ELYSIA_TRACE, type TraceEvent, type TraceListener, type TraceHandler, type TraceProcess, type TraceStream } from './trace';
export { getSchemaValidator, getResponseSchemaValidator, replaceSchemaType } from './schema';
export { mergeHook, mergeObjectArray, redirect, StatusMap, InvertedStatusMap, form, replaceUrlPath, checksum, cloneInference, deduplicateChecksum, ELYSIA_FORM_DATA, ELYSIA_REQUEST_ID } from './utils';
export { status, error, mapValueError, ParseError, NotFoundError, ValidationError, InternalServerError, InvalidCookieSignature, ERROR_CODE } from './error';
export type { EphemeralType, CreateEden, ComposeElysiaResponse, ElysiaConfig, SingletonBase, DefinitionBase, RouteBase, Handler, ComposedHandler, InputSchema, LocalHook, MergeSchema, RouteSchema, UnwrapRoute, InternalRoute, HTTPMethod, SchemaValidator, VoidHandler, PreHandler, BodyHandler, OptionalHandler, AfterResponseHandler, ErrorHandler, LifeCycleEvent, LifeCycleStore, LifeCycleType, MaybePromise, UnwrapSchema, Checksum, DocumentDecoration, InferContext, InferHandler, ResolvePath, MapResponse, MacroQueue, BaseMacro, MacroManager, BaseMacroFn, MacroToProperty, ResolveMacroContext, MergeElysiaInstances, MaybeArray, ModelValidator, MetadataBase, UnwrapBodySchema, UnwrapGroupGuardRoute, ModelValidatorError, ExcludeElysiaResponse, CoExist } from './types';
export { env } from './universal/env';
export { file, ElysiaFile } from './universal/file';
export type { ElysiaAdapter } from './adapter';
export { TypeSystemPolicy } from '@sinclair/typebox/system';
export type { Static, TSchema } from '@sinclair/typebox';
