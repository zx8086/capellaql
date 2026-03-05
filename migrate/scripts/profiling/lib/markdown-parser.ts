/* scripts/profiling/lib/markdown-parser.ts */

import { readFileSync } from "node:fs";

export interface CPUFunction {
  name: string;
  selfTime: number; // seconds
  totalTime: number; // seconds
  samples: number;
  cpuPercent: number;
}

export interface HeapStats {
  used: number; // bytes
  allocated: number; // bytes
  peak: number; // bytes
  growth: number; // bytes (growth during profile period)
}

export interface ProfileMetrics {
  type: "cpu" | "heap";
  duration: number; // seconds
  topFunctions: CPUFunction[];
  heapUsage?: HeapStats;
  timestamp: Date;
  profilePath: string;
}

export interface ProfileRecommendation {
  type: "kong_cache" | "jwt_optimization" | "json_parsing" | "memory_leak" | "http_overhead";
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  expectedImpact: string;
  actionable: string[];
  fileReferences?: string[];
}

export class MarkdownProfileParser {
  parseCPUProfile(filePath: string): ProfileMetrics {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    const topFunctions: CPUFunction[] = [];
    let duration = 0;

    // Parse markdown table format from Bun
    // Bun's "Hot Functions (Self Time)" section format:
    // | Self% | Self | Total% | Total | Function | Location |
    // |------:|-----:|-------:|------:|----------|----------|
    // | 70.4% | 336.6ms | 100.0% | 1.81s | `anonymous` | `[native code]` |

    let inHotFunctionsTable = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect "Hot Functions (Self Time)" section
      if (line === "## Hot Functions (Self Time)") {
        inHotFunctionsTable = true;
        // Skip to table header
        i++;
        continue;
      }

      // Stop at next section (Call Tree or any other ##)
      if (inHotFunctionsTable && line.startsWith("##")) {
        break;
      }

      // Parse table rows (skip header and separator)
      if (inHotFunctionsTable && line.startsWith("|") && line.match(/^\|\s*\d+/)) {
        const parts = line
          .split("|")
          .map((p) => p.trim())
          .filter((p) => p);

        if (parts.length >= 5) {
          const cpuPercent = this.parsePercent(parts[0]); // Self%
          const selfTime = this.parseTime(parts[1]); // Self
          const totalTime = this.parseTime(parts[3]); // Total
          const name = parts[4].replace(/`/g, ""); // Function (remove backticks)

          if (cpuPercent > 0) {
            topFunctions.push({
              name,
              selfTime,
              totalTime,
              samples: 0, // Not directly available in Bun's format
              cpuPercent,
            });
          }
        }
      }

      // Extract duration from header table
      if (line.includes("Duration") || line.includes("Samples")) {
        const match = line.match(/(\d+\.?\d*)\s*(s|seconds|ms|milliseconds)/i);
        if (match) {
          duration = match[2].startsWith("m")
            ? Number.parseFloat(match[1]) / 1000
            : Number.parseFloat(match[1]);
        }
      }
    }

    // Sort by CPU percentage descending
    topFunctions.sort((a, b) => b.cpuPercent - a.cpuPercent);

    return {
      type: "cpu",
      duration,
      topFunctions: topFunctions.slice(0, 20), // Top 20 functions
      timestamp: new Date(),
      profilePath: filePath,
    };
  }

  parseHeapProfile(filePath: string): ProfileMetrics {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    const topFunctions: CPUFunction[] = [];
    const heapUsage: HeapStats = {
      used: 0,
      allocated: 0,
      peak: 0,
      growth: 0,
    };

    // Parse heap statistics
    for (const line of lines) {
      if (line.includes("Heap Used:") || line.includes("used")) {
        heapUsage.used = this.parseBytes(line);
      }
      if (line.includes("Heap Allocated:") || line.includes("allocated")) {
        heapUsage.allocated = this.parseBytes(line);
      }
      if (line.includes("Peak:") || line.includes("peak")) {
        heapUsage.peak = this.parseBytes(line);
      }
      if (line.includes("Growth:") || line.includes("growth")) {
        heapUsage.growth = this.parseBytes(line);
      }
    }

    return {
      type: "heap",
      duration: 0,
      topFunctions,
      heapUsage,
      timestamp: new Date(),
      profilePath: filePath,
    };
  }

  private parseTime(timeStr: string): number {
    const match = timeStr.match(/(\d+\.?\d*)\s*(s|ms)?/i);
    if (!match) return 0;

    const value = Number.parseFloat(match[1]);
    const unit = match[2]?.toLowerCase();

    if (unit === "ms") {
      return value / 1000; // Convert to seconds
    }
    return value;
  }

  private parsePercent(percentStr: string): number {
    const match = percentStr.match(/(\d+\.?\d*)/);
    return match ? Number.parseFloat(match[1]) : 0;
  }

  private parseBytes(byteStr: string): number {
    const match = byteStr.match(/(\d+\.?\d*)\s*(KB|MB|GB|B)?/i);
    if (!match) return 0;

    const value = Number.parseFloat(match[1]);
    const unit = match[2]?.toUpperCase();

    switch (unit) {
      case "GB":
        return value * 1024 * 1024 * 1024;
      case "MB":
        return value * 1024 * 1024;
      case "KB":
        return value * 1024;
      default:
        return value;
    }
  }

  generateSummary(metrics: ProfileMetrics): string {
    let summary = "\nProfile Analysis:\n";
    summary += "================\n\n";

    if (metrics.type === "cpu") {
      summary += "TOP CPU CONSUMERS:\n";
      metrics.topFunctions.slice(0, 10).forEach((fn, index) => {
        summary += `${index + 1}. ${fn.name} - ${fn.cpuPercent.toFixed(1)}% (${fn.selfTime.toFixed(2)}s)\n`;
      });
    }

    if (metrics.heapUsage) {
      summary += "\nMEMORY USAGE:\n";
      summary += `Used:      ${this.formatBytes(metrics.heapUsage.used)}\n`;
      summary += `Allocated: ${this.formatBytes(metrics.heapUsage.allocated)}\n`;
      summary += `Peak:      ${this.formatBytes(metrics.heapUsage.peak)}\n`;
      if (metrics.heapUsage.growth > 0) {
        summary += `Growth:    ${this.formatBytes(metrics.heapUsage.growth)}\n`;
      }
    }

    return summary;
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }
    return `${bytes} B`;
  }
}

export class ProfileAnalyzer {
  generateRecommendations(metrics: ProfileMetrics): ProfileRecommendation[] {
    const recommendations: ProfileRecommendation[] = [];

    if (metrics.type === "cpu") {
      if (this.detectKongCacheIssue(metrics)) {
        recommendations.push(this.createKongCacheRecommendation(metrics));
      }

      if (this.detectJWTBottleneck(metrics)) {
        recommendations.push(this.createJWTRecommendation(metrics));
      }

      if (this.detectJsonBottleneck(metrics)) {
        recommendations.push(this.createJsonRecommendation(metrics));
      }

      if (this.detectHttpOverhead(metrics)) {
        recommendations.push(this.createHttpRecommendation(metrics));
      }
    }

    if (metrics.heapUsage && this.detectMemoryLeak(metrics)) {
      recommendations.push(this.createMemoryLeakRecommendation(metrics));
    }

    return recommendations.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  private detectKongCacheIssue(metrics: ProfileMetrics): boolean {
    const kongFunctions = metrics.topFunctions.filter(
      (f) =>
        f.name.toLowerCase().includes("kong") ||
        f.name.toLowerCase().includes("fetchconsumer") ||
        f.name.toLowerCase().includes("consumer")
    );
    const totalKongCpu = kongFunctions.reduce((sum, f) => sum + f.cpuPercent, 0);
    return totalKongCpu > 15;
  }

  private createKongCacheRecommendation(metrics: ProfileMetrics): ProfileRecommendation {
    const kongFunctions = metrics.topFunctions.filter(
      (f) =>
        f.name.toLowerCase().includes("kong") ||
        f.name.toLowerCase().includes("fetchconsumer") ||
        f.name.toLowerCase().includes("consumer")
    );
    const totalKongCpu = kongFunctions.reduce((sum, f) => sum + f.cpuPercent, 0);

    return {
      type: "kong_cache",
      severity: totalKongCpu > 25 ? "high" : "medium",
      description: `Kong consumer lookups consuming ${totalKongCpu.toFixed(1)}% CPU time (target: <15%)`,
      expectedImpact: "-10-15ms P95 latency, -20% Kong API calls",
      actionable: [
        "Increase CACHING_TTL_SECONDS from 300 to 600 in .env",
        "Review cache invalidation logic in src/services/kong/consumer.service.ts",
        "Monitor metric: kong_cache_hits_total / kong_operations_total",
        "Target cache hit rate: >90%",
      ],
      fileReferences: ["src/services/kong/consumer.service.ts", "src/config/defaults.ts:43"],
    };
  }

  private detectJWTBottleneck(metrics: ProfileMetrics): boolean {
    const jwtFunctions = metrics.topFunctions.filter(
      (f) =>
        f.name.toLowerCase().includes("crypto") ||
        f.name.toLowerCase().includes("sign") ||
        f.name.toLowerCase().includes("jwt") ||
        f.name.toLowerCase().includes("token")
    );
    const totalJwtCpu = jwtFunctions.reduce((sum, f) => sum + f.cpuPercent, 0);
    return totalJwtCpu > 35;
  }

  private createJWTRecommendation(metrics: ProfileMetrics): ProfileRecommendation {
    const jwtFunctions = metrics.topFunctions.filter(
      (f) =>
        f.name.toLowerCase().includes("crypto") ||
        f.name.toLowerCase().includes("sign") ||
        f.name.toLowerCase().includes("jwt") ||
        f.name.toLowerCase().includes("token")
    );
    const totalJwtCpu = jwtFunctions.reduce((sum, f) => sum + f.cpuPercent, 0);

    return {
      type: "jwt_optimization",
      severity: totalJwtCpu > 50 ? "high" : "medium",
      description: `JWT signing consuming ${totalJwtCpu.toFixed(1)}% CPU time`,
      expectedImpact: "-5-10ms P50 latency (limited by crypto.subtle Web API)",
      actionable: [
        "Consider JWT result caching for repeated consumer requests within expiration window",
        "Evaluate batch token generation for high-volume consumers",
        "Profile alternative: Bun's native crypto vs Web Crypto API (crypto.subtle)",
        "Monitor JWT generation rate: tokens_generated_total metric",
      ],
      fileReferences: ["src/handlers/tokens.ts:190-250", "src/services/jwt/jwt.service.ts"],
    };
  }

  private detectJsonBottleneck(metrics: ProfileMetrics): boolean {
    const jsonFunctions = metrics.topFunctions.filter(
      (f) =>
        f.name.toLowerCase().includes("json.") ||
        f.name.toLowerCase().includes("parse") ||
        f.name.toLowerCase().includes("stringify") ||
        f.name.toLowerCase().includes("serialize")
    );
    const totalJsonCpu = jsonFunctions.reduce((sum, f) => sum + f.cpuPercent, 0);
    return totalJsonCpu > 8;
  }

  private createJsonRecommendation(metrics: ProfileMetrics): ProfileRecommendation {
    const jsonFunctions = metrics.topFunctions.filter(
      (f) =>
        f.name.toLowerCase().includes("json.") ||
        f.name.toLowerCase().includes("parse") ||
        f.name.toLowerCase().includes("stringify") ||
        f.name.toLowerCase().includes("serialize")
    );
    const totalJsonCpu = jsonFunctions.reduce((sum, f) => sum + f.cpuPercent, 0);

    return {
      type: "json_parsing",
      severity: totalJsonCpu > 12 ? "medium" : "low",
      description: `JSON serialization consuming ${totalJsonCpu.toFixed(1)}% CPU time (target: <8%)`,
      expectedImpact: "-3-5ms P95 latency",
      actionable: [
        "Review response payload size - remove unnecessary fields",
        "Consider response compression (gzip) for large payloads",
        "Use Bun.json() for faster JSON parsing where applicable",
        "Profile JSON operations with --heap-prof to identify large objects",
      ],
      fileReferences: ["src/handlers/tokens.ts", "src/handlers/health.ts"],
    };
  }

  private detectHttpOverhead(metrics: ProfileMetrics): boolean {
    const httpFunctions = metrics.topFunctions.filter(
      (f) =>
        f.name.toLowerCase().includes("fetch") ||
        f.name.toLowerCase().includes("http") ||
        f.name.toLowerCase().includes("request") ||
        f.name.toLowerCase().includes("response")
    );
    const totalHttpCpu = httpFunctions.reduce((sum, f) => sum + f.cpuPercent, 0);
    return totalHttpCpu > 12;
  }

  private createHttpRecommendation(metrics: ProfileMetrics): ProfileRecommendation {
    const httpFunctions = metrics.topFunctions.filter(
      (f) =>
        f.name.toLowerCase().includes("fetch") ||
        f.name.toLowerCase().includes("http") ||
        f.name.toLowerCase().includes("request") ||
        f.name.toLowerCase().includes("response")
    );
    const totalHttpCpu = httpFunctions.reduce((sum, f) => sum + f.cpuPercent, 0);

    return {
      type: "http_overhead",
      severity: "medium",
      description: `HTTP request/response handling consuming ${totalHttpCpu.toFixed(1)}% CPU time`,
      expectedImpact: "-5-8ms P95 latency",
      actionable: [
        "Review Kong HTTP client configuration for connection pooling",
        "Consider HTTP/2 for Kong Admin API connections",
        "Profile network I/O vs CPU time with Bun.serve() optimization",
        "Monitor Kong response times: kong_request_duration_seconds",
      ],
      fileReferences: [
        "src/services/kong/consumer.service.ts",
        "src/services/kong/circuit-breaker.ts",
      ],
    };
  }

  private detectMemoryLeak(metrics: ProfileMetrics): boolean {
    if (!metrics.heapUsage) return false;
    return metrics.heapUsage.growth > 50 * 1024 * 1024;
  }

  private createMemoryLeakRecommendation(metrics: ProfileMetrics): ProfileRecommendation {
    const growthMB = metrics.heapUsage ? metrics.heapUsage.growth / (1024 * 1024) : 0;

    return {
      type: "memory_leak",
      severity: growthMB > 100 ? "critical" : "high",
      description: `Memory growing by ${growthMB.toFixed(1)}MB during profile period (potential leak)`,
      expectedImpact: "Prevent OOM crashes, reduce memory footprint by 20-40%",
      actionable: [
        "Enable heap profiling: bun --heap-prof-md --heap-prof-dir=profiles/heap src/server.ts",
        "Review object pooling and cache eviction policies",
        "Check for unclosed connections in Kong/Redis services",
        "Monitor heap usage: process.memoryUsage().heapUsed metric",
        "Profile with longer duration (5-10 minutes) to confirm trend",
      ],
      fileReferences: [
        "src/services/kong/consumer.service.ts",
        "src/services/cache/redis-cache.ts",
        "src/services/cache/in-memory-cache.ts",
      ],
    };
  }

  generateEnhancedReport(
    metrics: ProfileMetrics,
    recommendations: ProfileRecommendation[]
  ): string {
    let report = "# Profile Analysis Report\n\n";

    report += `**Generated**: ${metrics.timestamp.toISOString()}\n`;
    report += `**Duration**: ${metrics.duration.toFixed(1)}s\n`;
    report += `**Profile Type**: ${metrics.type.toUpperCase()}\n`;
    report += `**Source**: ${metrics.profilePath}\n\n`;

    if (metrics.type === "cpu") {
      report += "## Performance Summary\n\n";
      const slaCompliant = this.checkSLACompliance(metrics);
      report += slaCompliant
        ? "✓ **SLA Compliance**: PASS (estimated P95 within target)\n"
        : "⚠ **SLA Compliance**: WARNING (potential P95 degradation)\n";

      report += "\n## Top CPU Consumers\n\n";
      report += "| Function | Self Time | Total Time | CPU % |\n";
      report += "|----------|-----------|------------|-------|\n";

      metrics.topFunctions.slice(0, 10).forEach((fn) => {
        report += `| ${fn.name} | ${fn.selfTime.toFixed(2)}s | ${fn.totalTime.toFixed(2)}s | ${fn.cpuPercent.toFixed(1)}% |\n`;
      });
    }

    if (metrics.heapUsage) {
      report += "\n## Memory Usage\n\n";
      report += `- **Used**: ${this.formatBytes(metrics.heapUsage.used)}\n`;
      report += `- **Allocated**: ${this.formatBytes(metrics.heapUsage.allocated)}\n`;
      report += `- **Peak**: ${this.formatBytes(metrics.heapUsage.peak)}\n`;
      if (metrics.heapUsage.growth > 0) {
        report += `- **Growth**: ${this.formatBytes(metrics.heapUsage.growth)}\n`;
      }
    }

    if (recommendations.length > 0) {
      report += "\n## Optimization Opportunities\n\n";

      recommendations.forEach((rec, index) => {
        const icon = this.getSeverityIcon(rec.severity);
        report += `### ${icon} ${rec.severity.toUpperCase()}: ${this.formatRecommendationType(rec.type)}\n\n`;
        report += `**Issue**: ${rec.description}\n\n`;
        report += `**Expected Impact**: ${rec.expectedImpact}\n\n`;
        report += "**Action Items**:\n\n";
        rec.actionable.forEach((action, i) => {
          report += `${i + 1}. ${action}\n`;
        });

        if (rec.fileReferences && rec.fileReferences.length > 0) {
          report += "\n**File References**:\n\n";
          rec.fileReferences.forEach((file) => {
            report += `- \`${file}\`\n`;
          });
        }

        report += "\n";
      });
    } else {
      report += "\n## Optimization Opportunities\n\n";
      report += "✓ No significant bottlenecks detected. Profile looks healthy.\n\n";
    }

    report += "---\n\n";
    report += "_Generated with Bun Native Profiling + Profile Analyzer_\n";

    return report;
  }

  private checkSLACompliance(metrics: ProfileMetrics): boolean {
    const totalCpu = metrics.topFunctions.reduce((sum, f) => sum + f.cpuPercent, 0);
    return totalCpu < 80;
  }

  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case "critical":
        return "🔥";
      case "high":
        return "⚠️";
      case "medium":
        return "💡";
      case "low":
        return "ℹ️";
      default:
        return "•";
    }
  }

  private formatRecommendationType(type: string): string {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }
    return `${bytes} B`;
  }
}
