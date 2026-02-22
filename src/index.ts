/* src/index.ts */

import { createServer } from "./server";

// Start the server
createServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
