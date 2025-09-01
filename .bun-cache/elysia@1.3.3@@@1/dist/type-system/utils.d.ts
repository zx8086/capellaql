import { TUnsafe, TypeRegistry, type TAnySchema } from '@sinclair/typebox';
import { TypeCheck } from '@sinclair/typebox/compiler';
import { ValidationError } from '../error';
import type { FileOptions, FileUnit } from './types';
export declare const tryParse: (v: unknown, schema: TAnySchema) => any;
export declare function createType<TSchema = unknown, TReturn = unknown>(kind: string, func: TypeRegistry.TypeRegistryValidationFunction<TSchema>): TUnsafe<TReturn>;
export declare const compile: <T extends TAnySchema>(schema: T) => (TypeCheck<T> & {
    Create(): T["static"];
    Error(v: unknown): asserts v is T["static"];
}) | {
    Check: (v: unknown) => v is (T & {
        params: [];
    })["static"];
    CheckThrow: (v: unknown) => void;
    Decode: (v: unknown) => import("@sinclair/typebox").StaticDecodeIsAny<T> extends true ? unknown : (import("@sinclair/typebox").TDecodeType<T> & {
        params: [];
    })["static"];
    Create: () => (T & {
        params: [];
    })["static"];
    Error: (v: unknown) => ValidationError;
};
export declare const parseFileUnit: (size: FileUnit) => number;
export declare const checkFileExtension: (type: string, extension: string) => boolean;
export declare const loadFileType: () => Promise<void | Function>;
export declare const fileTypeFromBlob: (file: Blob | File) => any;
export declare const validateFileExtension: (file: Blob | File | undefined, extension: string | string[], name?: any) => Promise<true | undefined>;
export declare const validateFile: (options: FileOptions, value: any) => boolean;
