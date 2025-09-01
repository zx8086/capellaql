/**
 * # Mobius
 *
 * ! Don't try to understand this
 * ! Dark art ahead
 *
 * ? Total hours wasted by this: 0
 *
 * @author saltyAom
 */
type Whitespace = '\u{9}' | '\u{A}' | '\u{20}';
type TrimLeft<V extends string> = V extends `${Whitespace}${infer R}` ? TrimLeft<R> : V;
type TrimRight<V extends string> = V extends `${infer R}${Whitespace}` ? TrimRight<R> : V;
type Trim<V extends string> = TrimLeft<TrimRight<V>>;
type SplitUnion<S extends string> = S extends `${infer Head}|${infer Tail}` ? [Trim<Head>, ...SplitUnion<Tail>] : S extends '|' ? [] : [Trim<S>];
type GetLastLine<S extends string> = S extends `${infer Head}\n${infer Tail}` ? GetLastLine<Tail> : S extends '\n' ? [] : S;
type FirstWord<T extends string> = T extends `${infer A}${Whitespace}${infer _}` ? A : T;
type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};
type ExtractType<T extends string> = T extends `${infer Type}\n${infer Rest}` ? [TrimLeft<Type>, Rest] : T extends `${infer Type} ${infer Rest}` ? [TrimLeft<Type>, Rest] : never;
type CustomTypes = Record<string, string | Record<string, unknown>>;
type Scalar = Record<string, unknown>;
/**
 * Actually a string
 */
type ID = string;
type GQLTypes = {
    String: string;
    Int: number;
    Float: number;
    Boolean: boolean;
    ID: ID;
};
type MergeInterface<Interfaces extends string, Known extends CustomTypes = {}, Types extends Record<string, unknown> = {}> = Interfaces extends `${infer Name}${',' | '&'}${infer Rest}` ? MergeInterface<Rest, Known, Types & (Trim<Name> extends infer Key extends keyof Known ? Known[Key] : never)> : Types & (Trim<Interfaces> extends infer Key extends keyof Known ? Known[Key] : never);
export type RemoveComment<T extends string> = RemoveMultiLineComment<RemoveSingleLineComment<T>>;
type RemoveSingleLineComment<T extends string> = T extends `${infer First}#${infer Comment}\n${infer Rest}` ? `${First}${RemoveSingleLineComment<Rest>}` : T;
type RemoveMultiLineComment<T extends string> = T extends `${infer First}"""${infer Comment}"""${infer Rest}` ? `${First}${RemoveMultiLineComment<Rest>}` : T;
export type CreateInnerMobius<T extends string, Known extends CustomTypes = {}> = T extends `${infer Ops}{${infer Schema}}${infer Rest}` ? Trim<RemoveComment<Ops>> extends `${infer Keyword} ${infer Name}` ? CreateInnerMobius<Rest, Known & (Keyword extends 'type' ? {
    [name in TrimLeft<FirstWord<Name>>]: Prettify<MapSchema<RemoveComment<Schema>, Known> & (Name extends `${infer _} implements ${infer Interfaces}` ? MergeInterface<Interfaces, Known> : {})>;
} : Keyword extends 'input' | 'interface' ? {
    [name in TrimLeft<Name>]: Prettify<MapSchema<RemoveComment<Schema>>>;
} : Keyword extends 'enum' ? {
    [name in TrimLeft<Name>]: Exclude<NonNullable<MapEnum<RemoveComment<Schema>>>, ''>;
} : Keyword extends 'fragment' ? {
    Fragment: {
        [name in TrimLeft<FirstWord<Name>>]: Prettify<Name extends `${infer _} on ${infer Target}` ? {
            Target: Target;
            Value: Exclude<MapEnum<RemoveComment<Schema>>, '' | null | undefined>;
        } : {}>;
    };
} : Keyword extends 'directive' ? CreateInnerMobius<`${TrimLeft<GetLastLine<Ops>>}{${RemoveComment<Schema>}}`, Known> : Keyword extends 'union' ? CreateInnerMobius<`${TrimLeft<GetLastLine<Ops>>}{${RemoveComment<Schema>}}`, Known & MapUnion<Ops, Known>> : Keyword extends 'scalar' ? TrimLeft<RemoveComment<Ops>> extends `${infer _}\n${infer Prefix}` ? CreateInnerMobius<`${Prefix}{${Schema}}`, Known> : {} : {})> : Known : Known;
type MapInnerUnion<T extends string[], Known extends CustomTypes, Carry extends Record<string, unknown> = {}> = T extends [infer First extends string, ...infer Rest extends string[]] ? MapInnerUnion<Rest, Known, Prettify<Known extends {
    [a in First]: infer A;
} ? A extends string | boolean | number | symbol ? Carry | A : Carry & A : Carry>> : Carry;
type MapUnion<T extends string, Known extends CustomTypes = {}> = T extends `${infer _}union ${infer Name}=${infer Mapped}\n${infer Rest}` ? {
    [name in TrimRight<Name>]: MapInnerUnion<SplitUnion<Mapped>, Known>;
} & MapUnion<`\n${Rest}`, Known> : {};
type MapEnum<T extends string, Carry extends string | null = null> = T extends `${infer Name}${Whitespace | ','}${infer Rest}` ? MapEnum<Rest, Trim<Name> | Carry> : T extends `${infer Name}` ? Carry | Trim<Name> : Carry;
type MapSchema<T extends string, Known extends CustomTypes = {}> = T extends `${infer Name}:${infer Type}` ? Name extends `${infer Name}(${infer Params}` ? T extends `${infer Name}(${infer Params}):${infer Type}` ? ExtractType<Type> extends [
    infer Type extends string,
    infer Rest extends string
] ? {
    [word in Name as TrimLeft<Name> extends infer Candidate extends string ? Candidate extends `#${infer _}` ? never : Candidate : never]: Prettify<MapArgument<Params, Known>> extends infer Argument ? Partial<Argument> extends Argument ? (p?: Argument) => FormatType<Type> : (p: Argument) => FormatType<Type> : never;
} & MapSchema<Rest, Known> : {} : {} : ExtractType<Type> extends [
    infer Type extends string,
    infer Rest extends string
] ? {
    [word in Name as TrimLeft<Name>]: FormatType<Type>;
} & MapSchema<Rest, Known> : {} : {};
type RemovePrefixArrayBracket<T extends string> = T extends `[${infer Rest}` ? RemovePrefixArrayBracket<Rest> : T;
type CreateArray<T extends string, Carry extends string | null = (RemovePrefixArrayBracket<T> extends `${infer Name}]${string}` ? Name : T) extends infer Name ? Name extends `${infer A}!${string}` ? A : Name | null : never> = T extends `[${infer Rest}` ? CreateArray<Rest, [Carry]> : Carry;
type FormatType<T extends string> = FirstWord<T> extends infer T ? T extends `[${string}` ? T extends `${infer Type}!` ? CreateArray<Type> : CreateArray<T> | null : T extends `${infer Type}!` ? Type : T | null : never;
type MapArgument<T extends string, Known extends CustomTypes = {}, Carry extends Record<string, unknown> = {}> = T extends `${infer Name}:${infer Type}${'\n' | ','}${infer Rest}` ? MapArgument<Rest, Known, Type extends `${infer _}!${infer Rest}` ? Rest extends `${string}=${string}` ? Carry & {
    [name in TrimLeft<Name>]?: FormatType<FirstWord<TrimLeft<Type>>>;
} : Carry & {
    [name in TrimLeft<Name>]: FormatType<FirstWord<TrimLeft<Type>>>;
} : Carry & {
    [name in TrimLeft<Name>]?: FormatType<FirstWord<TrimLeft<Type>>>;
}> : T extends `${infer Name}:${infer Type}` ? Type extends `${infer _}!${infer Rest}` ? Rest extends `${string}=${string}` ? Carry & {
    [name in TrimLeft<Name>]?: FormatType<FirstWord<TrimLeft<Type>>>;
} : Carry & {
    [name in TrimLeft<Name>]: FormatType<FirstWord<TrimLeft<Type>>>;
} : Carry & {
    [name in TrimLeft<Name>]?: FormatType<FirstWord<TrimLeft<Type>>>;
} : Carry;
type MapFragment<Typed extends Record<string, unknown> & {
    Fragment: Record<string, {
        Target: string;
        Value: string;
    }>;
}> = Typed extends {
    Fragment: infer Fragments;
} ? Omit<Typed, 'Fragment'> & {
    Fragment: Prettify<{
        [K in keyof Fragments]: Fragments[K] extends {
            Target: infer Target extends string;
            Value: infer Value;
        } ? Typed extends {
            [a in Target]: infer Schema extends {
                [a in Extract<Value, string>]: unknown;
            };
        } ? Prettify<Pick<Schema, Extract<Value, string>>> : {} : {
            K: K;
            F: Fragments;
        };
    }>;
} : Typed;
/**
 * Infers GraphQL types to TypeScript
 *
 * @example
 * ```ts
 * ```ts
 * import type { CreateMobius } from 'graphql-mobius'
 *
 * const typeDefs = `
 *     # Hello World
 *     type A {
 *         A: String!
 *         B: String!
 *     }
 *
 *     # Hello World
 *     type Query {
 *         Hello(word: String!): A!
 *     }
 * `
 *
 * // This is an equivalent to calling new Mobius().mobius
 * type Engine = CreateMobius<typeof typeDefs>
 * ```
 */
export type CreateMobius<T extends string, Scalars extends Scalar = {}> = CreateInnerMobius<T> extends infer Typed ? Prettify<MapFragment<ResolveType<Typed, Scalars>> & ('Query' extends keyof Typed ? {} : {
    Query: {};
}) & ('Mutation' extends keyof Typed ? {} : {
    Mutation: {};
}) & ('Subscription' extends keyof Typed ? {} : {
    Subscription: {};
}) & ('Fragment' extends keyof Typed ? {} : {
    Fragment: {};
}) & Scalars> : never;
type MData = string | Function | null | [MData];
type UnwrapKey<K extends MData, Result extends Record<string, unknown>, Scalars extends Record<string, unknown>, Nullable = null extends K ? null : never> = NonNullable<K> extends (infer Next extends MData)[] ? UnwrapKey<Next, Result, Scalars>[] | Nullable : ResolveKey<K & string, Result, Scalars> | Nullable;
type ResolveKey<K extends string, Result extends Record<string, unknown>, Scalars extends Record<string, unknown>> = K extends (p: infer Params) => infer Returned ? {
    [K in keyof Params]: UnwrapKey<NonNullable<Params[K]>, Result, Scalars>;
} extends infer Argument ? Partial<Argument> extends Argument ? (p?: Argument) => UnwrapKey<Returned, Result, Scalars> : (p: Argument) => UnwrapKey<Returned, Result, Scalars> : never : K extends keyof Scalars ? Scalars[K] : K extends keyof Result ? Result[K] : unknown;
interface ResolveInnerType<Data extends Record<string, unknown | Record<string, MData>>, Scalars extends Record<string, unknown> = {}> {
    result: {
        [KI in keyof Data]: Data[KI] extends Record<string, MData> ? {
            [KJ in keyof Data[KI]]: UnwrapKey<Data[KI][KJ], this['result'], Scalars & GQLTypes>;
        } : Data[KI];
    };
}
export type ResolveType<Data extends Record<string, unknown | Record<string, MData>>, Scalars extends Record<string, unknown> = {}> = ResolveInnerType<Data, Scalars>['result'];
type AddUndefinedIfNullable<T> = T extends null | undefined ? T | undefined : T;
type UndefinedToNullableFields<T> = T extends object ? {
    [K in keyof T]?: UndefinedToNullableFields<AddUndefinedIfNullable<T[K]>>;
} : AddUndefinedIfNullable<T>;
type MaybePromise<T> = T | Promise<T>;
export type Resolver<T extends {
    Query: Record<string, unknown>;
    Mutation: Record<string, unknown>;
    Subscription: Record<string, unknown>;
}, Context = unknown> = Prettify<({
    [K in keyof T['Query']]: T['Query'][K] extends (arg: infer Args) => infer Returned ? (parent: unknown, args: Args, context: Context, info: unknown) => MaybePromise<UndefinedToNullableFields<Returned>> | (Returned extends null ? void : never) : (parent: unknown, args: null | undefined | {}, context: Context, info: unknown) => MaybePromise<UndefinedToNullableFields<T['Query'][K]>> | (T['Query'][K] extends null ? void : never);
} extends infer A ? {} extends A ? {
    Query?: {};
} : {
    Query: A;
} : never) & ({
    [K in keyof T['Mutation']]: T['Mutation'][K] extends (arg: infer Args) => infer Returned ? (parent: unknown, args: Args, context: Context, info: unknown) => MaybePromise<UndefinedToNullableFields<Returned>> | (Returned extends null ? void : never) : (parent: unknown, args: null | undefined | {}, context: Context, info: unknown) => MaybePromise<UndefinedToNullableFields<T['Mutation'][K]>> | (T['Mutation'][K] extends null ? void : never);
} extends infer A ? {} extends A ? {
    Mutation?: {};
} : {
    Mutation: A;
} : never) & ({
    [K in keyof T['Subscription']]: T['Subscription'][K] extends (arg: infer Args) => infer Returned ? (parent: unknown, args: Args, context: Context, info: unknown) => MaybePromise<UndefinedToNullableFields<Returned>> | (Returned extends null ? void : never) : (parent: unknown, args: null | undefined | {}, context: Context, info: unknown) => MaybePromise<UndefinedToNullableFields<T['Subscription'][K]>> | (T['Subscription'][K] extends null ? void : never);
} extends infer A ? {} extends A ? {
    Subscription?: {};
} : {
    Subscription: A;
} : never) & Partial<Omit<T, 'Query' | 'Mutation' | 'Subscription' | 'Fragment'>>>;
type Selective<T> = T extends object ? {
    [K in keyof T]?: K extends 'where' ? T[K] : Selective<T[K]>;
} & ('where' extends keyof T ? T['where'] extends NonNullable<T['where']> ? {
    select: T['Select'];
    where: T['where'];
} : {} : {}) : T;
type UnwrapArray<T> = T extends Array<infer R> ? R extends any[] ? UnwrapArray<R> : R : T;
/**
 * Create Prisma-like argument syntax for Client
 */
export type CreateQuery<T extends Record<string, unknown>> = (NonNullable<T> extends infer T ? {
    [K in keyof T]: T[K] extends (_: infer Params) => infer Query ? NonNullable<UnwrapArray<NonNullable<Query>>> extends Record<string, unknown> ? NonNullable<UnwrapArray<Query>> extends infer A extends Record<string, unknown> ? {
        select: CreateQuery<A>;
        where: Params;
    } : {} : {
        select: true | undefined | null;
        where: T[K] extends (_: infer Params) => any ? Params : never;
    } : NonNullable<UnwrapArray<T[K]>> extends infer Query extends Record<string, unknown> ? {} extends UnwrapArray<Query> ? true | undefined | null : CreateQuery<UnwrapArray<Query>> : true | undefined | null;
} : never) & {
    __typename?: true | undefined | null;
};
type UnwrapFunctionalSchema<Schema extends Record<string, unknown> | Function | null> = Schema extends (...p: any[]) => infer Returned ? NonNullable<UnwrapArray<Returned>> extends infer A extends Record<string, unknown> ? A : Returned : Schema extends Record<string, unknown> ? Schema : never;
type ResolveQuery<Query extends Record<string, unknown>, Model extends Record<string, unknown>> = {
    [K in keyof Query]: Model extends Record<K, infer Schema extends Record<string, unknown> | Function | null> ? Model[K] extends (...args: any[]) => any[] ? Resolve<Query, Model>[K][] : Resolve<Query, Model>[K] : never;
};
type Resolve<Query extends Record<string, unknown>, M extends Record<string, unknown>> = NonNullable<M> extends infer Model ? Prettify<{
    [K in keyof Query]: Model extends Record<K, infer Schema extends Record<string, unknown> | Function | null> ? Query[K] extends true ? Model[K] : Query[K] extends {
        select: infer Selected extends Record<string, unknown>;
    } ? Resolve<Selected, UnwrapFunctionalSchema<Schema>> : Query[K] extends Record<string, unknown> ? Resolve<Query[K], UnwrapFunctionalSchema<Schema>> : {} : K extends keyof Model ? Model[K] extends Array<any> ? K extends keyof Query ? Resolve<Query[K] extends Record<string, unknown> ? Query[K] : {}, Model[K][number]>[] : unknown[] : Model[K] : never;
}> : never;
/**
 * Create Prisma-like function for GraphQL
 */
export type MakeExecutable<TypeDefs extends {
    Query: Record<string, unknown>;
    Mutation: Record<string, unknown>;
    Subscription: Record<string, unknown>;
}, Scalars extends Scalar = {}> = <Query extends Selective<CreateQuery<TypeDefs['Query']>>, Mutate extends Selective<CreateQuery<TypeDefs['Mutation']>>, Subscription extends Selective<CreateQuery<TypeDefs['Subscription']>>>(params: {
    query?: Query;
    mutate?: Mutate;
    subscription?: Subscription;
}) => Promise<Prettify<({} extends Query ? {} : Resolve<Query, TypeDefs['Query'] & Scalars>) & ({} extends Mutate ? {} : Resolve<Mutate, TypeDefs['Mutation'] & Scalars>) & ({} extends Subscription ? {} : Resolve<Subscription, TypeDefs['Subscription'] & Scalars>)>>;
/**
 * Map Prisma-like JSON to GraphQL query (string)
 */
export declare const mobiusToGraphQL: <T extends "query" | "mutation" | "subscription">(type: T, params: Record<T, Record<string, unknown>>) => string;
/**
 * Create fragments for usage in Prisma-like client
 */
export declare const createFragment: (schema: string) => Record<string, Record<string, true>>;
type ToSelectiveFragment<T extends Record<string, unknown>> = Prettify<{
    [K in keyof T]: T[K] extends Record<string, unknown> ? ToSelectiveFragment<T[K]> : true;
}>;
export declare class Mobius<Declaration extends string = '', const Scalars extends Scalar = {}, TypeDefs extends CreateMobius<Declaration, Scalars> = CreateMobius<Declaration, Scalars>> {
    config?: {
        url?: string | undefined;
        fetch?: ((query: string) => Promise<unknown>) | undefined;
        typeDefs?: Declaration | undefined;
    } | undefined;
    /**
     * ! For type declaration only
     */
    klein: TypeDefs | null;
    /**
     * ! For type declaration only
     */
    resolvers: Resolver<TypeDefs> | null;
    /**
     * Available if `typeDefs` is passed
     */
    fragments: ToSelectiveFragment<TypeDefs['Fragment']> | null;
    constructor(config?: {
        url?: string | undefined;
        fetch?: ((query: string) => Promise<unknown>) | undefined;
        typeDefs?: Declaration | undefined;
    } | undefined);
    protected get fetch(): (query: string) => Promise<unknown>;
    $<Query extends Selective<CreateQuery<TypeDefs['Query']>>, Mutate extends Selective<CreateQuery<TypeDefs['Mutation']>>, Subscription extends Selective<CreateQuery<TypeDefs['Subscription']>>>(params: {
        query?: Query;
        mutate?: Mutate;
        subscription?: Subscription;
    }): {
        query: string;
        mutation: string;
        subscription: string;
    };
    query<Query extends Selective<CreateQuery<TypeDefs['Query']>>>(params: Query): Promise<Prettify<{} extends Query ? {} : ResolveQuery<Query, TypeDefs['Query'] & Scalars>> | null>;
    mutate<Mutate extends Selective<CreateQuery<TypeDefs['Mutation']>>>(params: Mutate): Promise<Prettify<{} extends Mutate ? {} : ResolveQuery<Mutate, TypeDefs['Mutation'] & Scalars>>>;
    subscription<Subscription extends Selective<CreateQuery<TypeDefs['Subscription']>>>(params: Subscription): Promise<Prettify<{} extends Subscription ? {} : ResolveQuery<Subscription, TypeDefs['Subscription'] & Scalars>>>;
}
export default Mobius;
