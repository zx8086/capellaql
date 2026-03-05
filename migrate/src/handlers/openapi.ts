/* src/handlers/openapi.ts */

import { getApiDocGenerator } from "../openapi-generator";
import { getCorsHeaders } from "../utils/cors";
import { log } from "../utils/logger";
import { createNotModifiedResponse, generateETag, generateRequestId } from "../utils/response";

// Cache for generated spec and ETag
let cachedSpec: Record<string, unknown> | null = null;
let cachedJsonContent: string | null = null;
let cachedYamlContent: string | null = null;
let cachedJsonETag: string | null = null;
let cachedYamlETag: string | null = null;

// Reset cache function for testing
export function resetOpenAPICache(): void {
  cachedSpec = null;
  cachedJsonContent = null;
  cachedYamlContent = null;
  cachedJsonETag = null;
  cachedYamlETag = null;
}

function convertToYaml(obj: Record<string, unknown> | object, indent = 0): string {
  const spaces = " ".repeat(indent);
  let yaml = "";

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      yaml += `${spaces}${key}: null\n`;
    } else if (typeof value === "object" && !Array.isArray(value)) {
      yaml += `${spaces}${key}:\n`;
      yaml += convertToYaml(value, indent + 2);
    } else if (Array.isArray(value)) {
      yaml += `${spaces}${key}:\n`;
      for (const item of value) {
        if (typeof item === "object") {
          yaml += `${spaces}- \n`;
          yaml += convertToYaml(item, indent + 4);
        } else {
          yaml += `${spaces}- ${item}\n`;
        }
      }
    } else if (typeof value === "string") {
      yaml += `${spaces}${key}: "${value}"\n`;
    } else {
      yaml += `${spaces}${key}: ${value}\n`;
    }
  }

  return yaml;
}

export async function handleOpenAPISpec(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const acceptHeader = req.headers.get("Accept") || undefined;

  log("Processing OpenAPI spec request", {
    component: "openapi",
    operation: "handle_openapi_spec",
    endpoint: "/",
    accept_header: acceptHeader,
    requestId,
  });

  try {
    // Generate or use cached spec
    if (!cachedSpec) {
      const spec = getApiDocGenerator().generateSpec();
      cachedSpec = spec;
      cachedJsonContent = JSON.stringify(spec, null, 2);
      cachedYamlContent = convertToYaml(spec);

      // Generate ETags asynchronously
      cachedJsonETag = await generateETag(cachedJsonContent);
      cachedYamlETag = await generateETag(cachedYamlContent);

      log("OpenAPI spec cached with ETags", {
        component: "openapi",
        jsonETag: cachedJsonETag,
        yamlETag: cachedYamlETag,
      });
    }

    // Ensure spec is available
    if (!cachedJsonContent || !cachedYamlContent) {
      throw new Error("OpenAPI spec not generated");
    }

    const preferYaml =
      acceptHeader?.includes("application/yaml") ||
      acceptHeader?.includes("text/yaml") ||
      acceptHeader?.includes("application/x-yaml");

    const contentType = preferYaml ? "application/yaml" : "application/json";
    const content = preferYaml ? cachedYamlContent : cachedJsonContent;
    const etag = preferYaml ? cachedYamlETag : cachedJsonETag;

    // Check for conditional request using actual request headers (Bun native pattern)
    const ifNoneMatch = req.headers.get("If-None-Match");
    if (etag && ifNoneMatch === etag) {
      log("OpenAPI spec not modified (304)", {
        component: "openapi",
        etag,
        requestId,
      });

      return createNotModifiedResponse(requestId, etag, {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300",
        ...getCorsHeaders(),
      });
    }

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "X-Request-Id": requestId,
      "Cache-Control": "public, max-age=300",
      ...getCorsHeaders(),
    };

    // Add ETag if available
    if (etag) {
      headers.ETag = etag;
    }

    // Add Last-Modified header
    headers["Last-Modified"] = new Date().toUTCString();

    log("OpenAPI spec served", {
      component: "openapi",
      contentType,
      size: content?.length || 0,
      etag,
      requestId,
    });

    return new Response(content, {
      status: 200,
      headers,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Failed to generate OpenAPI specification",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
        requestId,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId,
          ...getCorsHeaders(),
        },
      }
    );
  }
}
