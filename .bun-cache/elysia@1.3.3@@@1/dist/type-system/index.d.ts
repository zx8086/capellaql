import type { ArrayOptions, DateOptions, IntegerOptions, ObjectOptions, SchemaOptions, TAnySchema, TArray, TBoolean, TDate, TEnumValue, TInteger, TNumber, TObject, TProperties, TSchema, TString, NumberOptions, JavaScriptTypeBuilder, StringOptions, TUnsafe } from '@sinclair/typebox';
import './format';
import { CookieValidatorOptions, TFile, FilesOptions, NonEmptyArray, TForm, TUnionEnum, ElysiaTransformDecodeBuilder } from './types';
declare const t: Omit<JavaScriptTypeBuilder, "String" | "Transform"> & typeof ElysiaType & {
    Transform<Type extends TSchema>(type: Type): ElysiaTransformDecodeBuilder<Type>;
};
interface ElysiaStringOptions extends StringOptions {
    /**
     * Whether the value include JSON escape sequences or not
     *
     * When using JSON Accelerator, this will bypass the JSON escape sequence validation
     *
     * Set to `true` if the value doesn't include JSON escape sequences
     *
     * @default false
     */
    trusted?: boolean;
}
export declare const ElysiaType: {
    String: (property?: ElysiaStringOptions) => TString;
    Numeric: (property?: NumberOptions) => TNumber;
    Integer: (property?: IntegerOptions) => TInteger;
    Date: (property?: DateOptions) => TDate;
    BooleanString: (property?: SchemaOptions) => TBoolean;
    ObjectString: <T extends TProperties>(properties: T, options?: ObjectOptions) => TObject<T>;
    ArrayString: <T extends TSchema = TString>(children?: T, options?: ArrayOptions) => TArray<T>;
    File: TFile;
    Files: (options?: FilesOptions) => TUnsafe<File[]>;
    Nullable: <T extends TSchema>(schema: T, options?: SchemaOptions) => import("@sinclair/typebox").TUnion<[T, import("@sinclair/typebox").TNull]>;
    /**
     * Allow Optional, Nullable and Undefined
     */
    MaybeEmpty: <T extends TSchema>(schema: T, options?: SchemaOptions) => import("@sinclair/typebox").TUnion<[T, import("@sinclair/typebox").TNull, import("@sinclair/typebox").TUndefined]>;
    Cookie: <T extends TProperties>(properties: T, { domain, expires, httpOnly, maxAge, path, priority, sameSite, secure, secrets, sign, ...options }?: CookieValidatorOptions<T>) => TObject<T>;
    UnionEnum: <const T extends NonEmptyArray<TEnumValue> | Readonly<NonEmptyArray<TEnumValue>>>(values: T, options?: SchemaOptions) => TUnionEnum<T>;
    NoValidate: <T extends TAnySchema>(v: T, enabled?: boolean) => T;
    Form: <T extends TProperties>(v: T, options?: ObjectOptions) => TForm<T>;
};
export { t };
export { TypeSystemPolicy, TypeSystem, TypeSystemDuplicateFormat, TypeSystemDuplicateTypeKind } from '@sinclair/typebox/system';
export { TypeRegistry, FormatRegistry } from '@sinclair/typebox';
export { TypeCompiler, TypeCheck } from '@sinclair/typebox/compiler';
