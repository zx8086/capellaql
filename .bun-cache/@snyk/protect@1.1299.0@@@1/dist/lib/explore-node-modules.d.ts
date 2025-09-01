import { FoundPhysicalPackage } from './types';
/**
 * Explore the node_modules of a project, starting with the given path and recusively exploring deeper,
 * looking for modules which match the package names we are considering for patching.
 * @param pathToCheck the path to look for a matching module.
 * @param packageNamesOfInterest - a list of package names we are considering for patching.
 * @returns
 */
export declare function findPhysicalModules(pathToCheck: string, packageNamesOfInterest: Readonly<string[]>): FoundPhysicalPackage[];
