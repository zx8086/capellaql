import { type Elysia } from 'elysia';
import type { CreateMobius, Resolver } from 'graphql-mobius';
import { type GraphQLSchemaWithContext, type YogaServerOptions, type YogaInitialContext } from 'graphql-yoga';
import type { IExecutableSchemaDefinition } from '@graphql-tools/schema';
import type { TypeSource } from '@graphql-tools/utils';
type MaybePromise<T> = T | Promise<T>;
type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};
/**
 * Extra type safety for Yoga
 * can pass either schema prop defined by
 * ElysiaYogaConfigWithSchema
 *
 * or
 *
 * typeDefs and resolvers props
 * (to build schema with: createSchema())
 * defined by
 * ElysiaYogaConfigWithTypeDefsAndResolvers
 *
 */
interface ElysiaYogaConfigWithSchema<TypeDefs extends TypeSource | never, Context extends undefined | MaybePromise<Record<string, unknown>> | ((initialContext: YogaInitialContext) => MaybePromise<unknown>)> extends Omit<YogaServerOptions<{}, {}>, 'typeDefs' | 'context' | 'cors'>, Omit<IExecutableSchemaDefinition<{}>, 'typeDefs'> {
    /**
     * @default /graphql
     *
     * path for GraphQL handler
     */
    path?: string;
    /**
     * TypeDefs
     */
    typeDefs?: undefined;
    context?: Context;
    schema: GraphQLSchemaWithContext<Context>;
    /**
     * If this field isn't presented, context type is null
     * It must also contains params when used
     * I don't know why please help
     */
    useContext?: (_: this['context']) => void;
    resolvers?: undefined;
}
interface ElysiaYogaConfigWithTypeDefsAndResolvers<TypeDefs extends TypeSource, Context extends undefined | MaybePromise<Record<string, unknown>> | ((initialContext: YogaInitialContext) => MaybePromise<unknown>)> extends Omit<YogaServerOptions<{}, {}>, 'typeDefs' | 'context' | 'cors'>, Omit<IExecutableSchemaDefinition<{}>, 'resolvers'> {
    /**
     * @default /graphql
     *
     * path for GraphQL handler
     */
    path?: string;
    /**
     * TypeDefs
     */
    typeDefs: TypeDefs;
    context?: Context;
    schema?: undefined;
    /**
     * If this field isn't presented, context type is null
     * It must also contains params when used
     * I don't know why please help
     */
    useContext?: (_: this['context']) => void;
    resolvers: Resolver<TypeDefs extends string ? CreateMobius<TypeDefs> : {
        Query: Record<string, unknown>;
        Mutation: Record<string, unknown>;
        Subscription: Record<string, unknown>;
    }, Context extends undefined ? {
        request: Request;
    } : Context extends (a: YogaInitialContext) => infer A ? Prettify<NonNullable<Awaited<A>> & {
        request: Request;
    }> : Prettify<NonNullable<Awaited<Context>> & {
        request: Request;
    }>>;
}
type ElysiaYogaConfig<TypeDefs extends TypeSource, Context extends undefined | MaybePromise<Record<string, unknown>> | ((initialContext: YogaInitialContext) => MaybePromise<unknown>)> = ElysiaYogaConfigWithSchema<TypeDefs, Context> | ElysiaYogaConfigWithTypeDefsAndResolvers<TypeDefs, Context>;
/**
 * GraphQL Yoga supports for Elysia
 *
 * @example
 * ```typescript
 * import { Elysia } from 'elysia'
 * import { yoga } from '@elysiajs/graphql-yoga'
 *
 * const app = new Elysia()
 *     .use(
 *         yoga({
 *             typeDefs: `
 *                 type Query {
 *                     hi: String
 *                 }
 *             `,
 *             resolvers: {
 *                 Query: {
 *                     hi: () => 'Hi from Elysia'
 *                 }
 *             }
 *         })
 *     )
 *     .listen(8080)
 * ```
 *
 *  * @example
 * ```typescript
 * import { Elysia } from 'elysia'
 * import { yoga, createSchema } from '@elysiajs/graphql-yoga'
 * const { loadFiles } = require('@graphql-tools/load-files')
 *
 * const schema = createSchema({
 *  typeDefs: await loadFiles('src/typeDefs/*.graphql')
 *  resolvers: await loadFiles('src/resolvers/*.{js,ts}')
 * })
 *
 * const app = new Elysia()
 *     .use(
 *         yoga({
 *             schema
 *         })
 *     )
 *     .listen(8080)
 * ```
 */
export declare const yoga: <TypeDefs extends TypeSource, Context extends undefined | MaybePromise<Record<string, unknown>> | ((initialContext: YogaInitialContext) => MaybePromise<unknown>), Prefix extends string = "/graphql">({ path, typeDefs, resolvers, resolverValidationOptions, inheritResolversFromInterfaces, updateResolversInPlace, schemaExtensions, schema, ...config }: ElysiaYogaConfig<TypeDefs, Context>) => (app: Elysia) => Elysia<"", {
    decorator: {};
    store: {};
    derive: {};
    resolve: {};
}, {
    typebox: {};
    error: {};
}, {
    schema: {};
    standaloneSchema: {};
    macro: {};
    macroFn: {};
    parser: {};
}, {} & import("elysia").CreateEden<`${Prefix}`, {
    get: {
        body: unknown;
        params: import("elysia/dist/types").IsNever<keyof (import("elysia/dist/types").IsNever<(import("elysia/dist/types").GetPathParameter<`${Prefix}`> extends infer T ? T extends import("elysia/dist/types").GetPathParameter<`${Prefix}`> ? T extends `${string}?` ? never : T : never : never) | keyof { [Param in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param extends `${infer OptionalParam}?` ? OptionalParam : never]?: string | undefined; }> extends true ? {} : { [Param_1 in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param_1 extends `${string}?` ? never : Param_1]: string; } & { [Param in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param extends `${infer OptionalParam}?` ? OptionalParam : never]?: string | undefined; } extends infer T_1 ? { [K in keyof T_1]: ({ [Param_1 in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param_1 extends `${string}?` ? never : Param_1]: string; } & { [Param in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param extends `${infer OptionalParam}?` ? OptionalParam : never]?: string | undefined; })[K]; } : never)> extends true ? { [Param_2 in import("elysia/dist/types").GetPathParameter<Prefix> as Param_2 extends `${string}?` ? never : Param_2]: string; } & { [Param_3 in import("elysia/dist/types").GetPathParameter<Prefix> as Param_3 extends `${infer OptionalParam}?` ? OptionalParam : never]?: string | undefined; } extends infer T_2 ? { [K_1 in keyof T_2]: ({ [Param_2 in import("elysia/dist/types").GetPathParameter<Prefix> as Param_2 extends `${string}?` ? never : Param_2]: string; } & { [Param_3 in import("elysia/dist/types").GetPathParameter<Prefix> as Param_3 extends `${infer OptionalParam}?` ? OptionalParam : never]?: string | undefined; })[K_1]; } : never : import("elysia/dist/types").IsNever<(import("elysia/dist/types").GetPathParameter<`${Prefix}`> extends infer T_3 ? T_3 extends import("elysia/dist/types").GetPathParameter<`${Prefix}`> ? T_3 extends `${string}?` ? never : T_3 : never : never) | keyof { [Param in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param extends `${infer OptionalParam}?` ? OptionalParam : never]?: string | undefined; }> extends true ? {} : { [Param_1 in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param_1 extends `${string}?` ? never : Param_1]: string; } & { [Param in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param extends `${infer OptionalParam}?` ? OptionalParam : never]?: string | undefined; } extends infer T_4 ? { [K in keyof T_4]: ({ [Param_1 in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param_1 extends `${string}?` ? never : Param_1]: string; } & { [Param in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param extends `${infer OptionalParam}?` ? OptionalParam : never]?: string | undefined; })[K]; } : never;
        query: unknown;
        headers: unknown;
        response: {
            200: Response;
        } & {} & (import("elysia/dist/types").EmptyRouteSchema extends import("elysia").MergeSchema<import("elysia").UnwrapRoute<import("elysia").InputSchema<never>, {}, `${Prefix}`>, import("elysia").MergeSchema<{}, import("elysia").MergeSchema<{}, {}, "">, "">, ""> ? {} : {
            422: {
                type: "validation";
                on: string;
                summary?: string;
                message?: string;
                found?: unknown;
                property?: string;
                expected?: string;
            };
        }) extends infer T_5 ? { [K_2 in keyof T_5]: ({
            200: Response;
        } & {} & (import("elysia/dist/types").EmptyRouteSchema extends import("elysia").MergeSchema<import("elysia").UnwrapRoute<import("elysia").InputSchema<never>, {}, `${Prefix}`>, import("elysia").MergeSchema<{}, import("elysia").MergeSchema<{}, {}, "">, "">, ""> ? {} : {
            422: {
                type: "validation";
                on: string;
                summary?: string;
                message?: string;
                found?: unknown;
                property?: string;
                expected?: string;
            };
        }))[K_2]; } : never;
    };
}> & import("elysia").CreateEden<`${Prefix}`, {
    post: {
        body: unknown;
        params: import("elysia/dist/types").IsNever<keyof (import("elysia/dist/types").IsNever<(import("elysia/dist/types").GetPathParameter<`${Prefix}`> extends infer T_6 ? T_6 extends import("elysia/dist/types").GetPathParameter<`${Prefix}`> ? T_6 extends `${string}?` ? never : T_6 : never : never) | keyof { [Param in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param extends `${infer OptionalParam}?` ? OptionalParam : never]?: string | undefined; }> extends true ? {} : { [Param_1 in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param_1 extends `${string}?` ? never : Param_1]: string; } & { [Param in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param extends `${infer OptionalParam}?` ? OptionalParam : never]?: string | undefined; } extends infer T_7 ? { [K in keyof T_7]: ({ [Param_1 in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param_1 extends `${string}?` ? never : Param_1]: string; } & { [Param in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param extends `${infer OptionalParam}?` ? OptionalParam : never]?: string | undefined; })[K]; } : never)> extends true ? { [Param_2 in import("elysia/dist/types").GetPathParameter<Prefix> as Param_2 extends `${string}?` ? never : Param_2]: string; } & { [Param_3 in import("elysia/dist/types").GetPathParameter<Prefix> as Param_3 extends `${infer OptionalParam}?` ? OptionalParam : never]?: string | undefined; } extends infer T_8 ? { [K_1 in keyof T_8]: ({ [Param_2 in import("elysia/dist/types").GetPathParameter<Prefix> as Param_2 extends `${string}?` ? never : Param_2]: string; } & { [Param_3 in import("elysia/dist/types").GetPathParameter<Prefix> as Param_3 extends `${infer OptionalParam}?` ? OptionalParam : never]?: string | undefined; })[K_1]; } : never : import("elysia/dist/types").IsNever<(import("elysia/dist/types").GetPathParameter<`${Prefix}`> extends infer T_9 ? T_9 extends import("elysia/dist/types").GetPathParameter<`${Prefix}`> ? T_9 extends `${string}?` ? never : T_9 : never : never) | keyof { [Param in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param extends `${infer OptionalParam}?` ? OptionalParam : never]?: string | undefined; }> extends true ? {} : { [Param_1 in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param_1 extends `${string}?` ? never : Param_1]: string; } & { [Param in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param extends `${infer OptionalParam}?` ? OptionalParam : never]?: string | undefined; } extends infer T_10 ? { [K in keyof T_10]: ({ [Param_1 in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param_1 extends `${string}?` ? never : Param_1]: string; } & { [Param in import("elysia/dist/types").GetPathParameter<`${Prefix}`> as Param extends `${infer OptionalParam}?` ? OptionalParam : never]?: string | undefined; })[K]; } : never;
        query: unknown;
        headers: unknown;
        response: {
            200: Response;
        } & {} & (import("elysia/dist/types").EmptyRouteSchema extends import("elysia").MergeSchema<import("elysia").UnwrapRoute<import("elysia").InputSchema<never>, {}, `${Prefix}`>, import("elysia").MergeSchema<{}, import("elysia").MergeSchema<{}, {}, "">, "">, ""> ? {} : {
            422: {
                type: "validation";
                on: string;
                summary?: string;
                message?: string;
                found?: unknown;
                property?: string;
                expected?: string;
            };
        }) extends infer T_11 ? { [K_2 in keyof T_11]: ({
            200: Response;
        } & {} & (import("elysia/dist/types").EmptyRouteSchema extends import("elysia").MergeSchema<import("elysia").UnwrapRoute<import("elysia").InputSchema<never>, {}, `${Prefix}`>, import("elysia").MergeSchema<{}, import("elysia").MergeSchema<{}, {}, "">, "">, ""> ? {} : {
            422: {
                type: "validation";
                on: string;
                summary?: string;
                message?: string;
                found?: unknown;
                property?: string;
                expected?: string;
            };
        }))[K_2]; } : never;
    };
}>, {
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
export default yoga;
