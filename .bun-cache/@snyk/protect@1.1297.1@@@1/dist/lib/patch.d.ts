export declare function createOldStylePatchAppliedFlagFilename(vulnId: string): string;
export declare function applyPatchToFile(patchContents: string, baseFolder: string, vulnId: string): string;
export declare function extractTargetFilePathFromPatch(patchContents: string): string;
export declare function patchString(patchContents: string, contentsToPatch: string): string;
