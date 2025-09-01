import { Patch, VulnPatches, VulnIdAndPackageName } from './types';
export declare function fetchPatches(vulnId: string, packageName: string, packageVersion: string): Promise<Patch[]>;
export declare function getAllPatches(vulnIdAndPackageNames: VulnIdAndPackageName[], packageNameToVersionsMap: Map<string, string[]>): Promise<Map<string, VulnPatches[]>>;
