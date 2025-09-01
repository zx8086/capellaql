import type { Context } from '../../context';
import type { AnyLocalHook, MaybePromise } from '../../types';
export declare const createNativeStaticHandler: (handle: unknown, hooks: AnyLocalHook, setHeaders?: Context["set"]["headers"]) => (() => MaybePromise<Response>) | undefined;
