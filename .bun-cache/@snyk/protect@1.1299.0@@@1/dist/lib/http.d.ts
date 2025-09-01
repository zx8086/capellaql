/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import { IncomingMessage } from 'http';
import { RequestOptions } from 'https';
export type SnykResponse = {
    res: IncomingMessage;
    body: any;
};
export declare function request(url: string, data?: string | Buffer, options?: RequestOptions): Promise<SnykResponse>;
export declare function postJson(url: string, jsonData: any, options?: RequestOptions): Promise<SnykResponse>;
