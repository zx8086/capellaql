/* src/server/handlers/dashboard.ts */

import * as path from "path";
import { fileURLToPath } from "url";
import type { RouteHandler } from "../types";
import { err } from "../../telemetry";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pre-compute dashboard path (relative to src/server/handlers/)
const DASHBOARD_PATH = path.resolve(__dirname, "../../dashboard/index.html");

// Error fallback HTML
const ERROR_HTML = `
<!DOCTYPE html>
<html>
  <head><title>Dashboard Error</title></head>
  <body>
    <h1>Dashboard Unavailable</h1>
    <p>Error loading dashboard. Please check server logs.</p>
    <p><a href="/health">Basic Health Check</a></p>
  </body>
</html>
`;

/**
 * Dashboard handler - serves the development dashboard HTML.
 * Uses Bun.file() for sendfile optimization.
 */
export const dashboardHandler: RouteHandler = async (_request, _context) => {
  try {
    // Use Bun.file() for optimal file serving with sendfile syscall
    const file = Bun.file(DASHBOARD_PATH);

    // Check if file exists
    if (!(await file.exists())) {
      err("Dashboard file not found", { path: DASHBOARD_PATH });
      return new Response(ERROR_HTML, {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    }

    // Return file response - Bun optimizes this with sendfile
    return new Response(file, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (error) {
    err("Dashboard loading failed", error);
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Dashboard Error</title></head>
        <body>
          <h1>Dashboard Unavailable</h1>
          <p>Error loading dashboard: ${error instanceof Error ? error.message : String(error)}</p>
          <p><a href="/health">Basic Health Check</a></p>
        </body>
      </html>
      `,
      {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }
    );
  }
};
