import { TModule, TObject, TSchema, type TAnySchema } from '@sinclair/typebox';
import { type Instruction as ExactMirrorInstruction } from 'exact-mirror';
import { type TypeCheck } from './type-system';
import { mapValueError } from './error';
import type { CookieOptions } from './cookies';
import type { ElysiaConfig, InputSchema, MaybeArray, StandaloneInputSchema } from './types';
type MapValueError = ReturnType<typeof mapValueError>;
export interface ElysiaTypeCheck<T extends TSchema> extends Omit<TypeCheck<T>, 'schema'> {
    schema: T;
    config: Object;
    Clean?(v: unknown): T;
    parse(v: unknown): T;
    safeParse(v: unknown): {
        success: true;
        data: T;
        error: null;
    } | {
        success: false;
        data: null;
        error: string | undefined;
        errors: MapValueError[];
    };
    hasAdditionalProperties: boolean;
    '~hasAdditionalProperties'?: boolean;
    hasDefault: boolean;
    '~hasDefault'?: boolean;
    isOptional: boolean;
    '~isOptional'?: boolean;
    hasTransform: boolean;
    '~hasTransform'?: boolean;
    hasRef: boolean;
    '~hasRef'?: boolean;
}
export declare const isOptional: (schema?: TSchema | TypeCheck<any> | ElysiaTypeCheck<any>) => any;
export declare const hasAdditionalProperties: (_schema: TAnySchema | TypeCheck<any> | ElysiaTypeCheck<any>) => boolean;
export declare const hasType: (type: string, schema: TAnySchema) => boolean;
export declare const hasProperty: (expectedProperty: string, _schema: TAnySchema | TypeCheck<any> | ElysiaTypeCheck<any>) => any;
export declare const hasRef: (schema: TAnySchema) => boolean;
export declare const hasTransform: (schema: TAnySchema) => boolean;
interface ReplaceSchemaTypeOptions {
    from: TSchema;
    to(options: Object): TSchema | null;
    excludeRoot?: boolean;
    rootOnly?: boolean;
    original?: TAnySchema;
    /**
     * Traverse until object is found except root object
     **/
    untilObjectFound?: boolean;
}
interface ReplaceSchemaTypeConfig {
    root: boolean;
    definitions?: Record<string, TSchema> | undefined;
}
export declare const replaceSchemaType: (schema: TSchema, options: MaybeArray<ReplaceSchemaTypeOptions>, _config?: Partial<Omit<ReplaceSchemaTypeConfig, "root">>) => TSchema;
export declare const getSchemaValidator: <T extends TSchema | string | undefined>(s: T, { models, dynamic, modules, normalize, additionalProperties, coerce, additionalCoerce, validators, sanitize }?: {
    models?: Record<string, TSchema>;
    modules?: TModule<any, any>;
    additionalProperties?: boolean;
    dynamic?: boolean;
    normalize?: ElysiaConfig<"">["normalize"];
    coerce?: boolean;
    additionalCoerce?: MaybeArray<ReplaceSchemaTypeOptions>;
    validators?: InputSchema["body"][];
    sanitize?: () => ExactMirrorInstruction["sanitize"];
}) => T extends TSchema ? ElysiaTypeCheck<TSchema> : undefined;
export declare const isUnion: (schema: TSchema) => boolean;
export declare const mergeObjectSchemas: (schemas: TSchema[]) => {
    schema: TObject | undefined;
    notObjects: TSchema[];
};
export declare const getResponseSchemaValidator: (s: InputSchema["response"] | undefined, { models, modules, dynamic, normalize, additionalProperties, validators, sanitize }: {
    modules: TModule<any, any>;
    models?: Record<string, TSchema>;
    additionalProperties?: boolean;
    dynamic?: boolean;
    normalize?: ElysiaConfig<"">["normalize"];
    validators?: StandaloneInputSchema["response"][];
    sanitize?: () => ExactMirrorInstruction["sanitize"];
}) => Record<number, ElysiaTypeCheck<any>> | undefined;
export declare const stringToStructureCoercions: () => ReplaceSchemaTypeOptions[];
export declare const coercePrimitiveRoot: () => ReplaceSchemaTypeOptions[];
export declare const getCookieValidator: ({ validator, modules, defaultConfig, config, dynamic, models, validators, sanitize }: {
    validator: TSchema | string | undefined;
    modules: TModule<any, any>;
    defaultConfig: CookieOptions | undefined;
    config: CookieOptions;
    dynamic: boolean;
    models: Record<string, TSchema> | undefined;
    validators?: InputSchema["cookie"][];
    sanitize?: () => ExactMirrorInstruction["sanitize"];
}) => ElysiaTypeCheck<TSchema>;
export {};
/**
 * This function will return the type of unioned if all unioned type is the same.
 * It's intent to use for content-type mapping only
 *
 * ```ts
 * t.Union([
 *   t.Object({
 *     password: t.String()
 *   }),
 *   t.Object({
 *     token: t.String()
 *   })
 * ])
 * ```
 */
