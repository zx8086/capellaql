// scripts/license-check.ts

interface LicensePolicy {
  allowedLicenses: string[];
  excludePackages: string[];
  projectName: string;
}

interface PackageInfo {
  name: string;
  version: string;
  license?: string;
  path?: string;
  dependencies?: Record<string, string>;
}

interface LicenseViolation {
  package: string;
  version: string;
  license: string;
  severity: "error" | "warning";
  message: string;
}

class BunLicenseChecker {
  private policy: LicensePolicy;
  private verbose: boolean;

  constructor(policy: LicensePolicy, verbose = false) {
    this.policy = policy;
    this.verbose = verbose;
  }

  async checkCompliance(): Promise<{ violations: LicenseViolation[]; totalPackages: number }> {
    try {
      if (this.verbose) {
        console.log("Starting Bun native license compliance check...");
      }

      // Get package information using bun pm ls
      const packages = await this.getPackageInfo();

      if (this.verbose) {
        console.log(` Analyzing ${packages.length} packages...`);
      }

      // Check each package for license violations
      const violations: LicenseViolation[] = [];

      for (const pkg of packages) {
        const violation = this.checkPackageLicense(pkg);
        if (violation) {
          violations.push(violation);
        }
      }

      return {
        violations,
        totalPackages: packages.length,
      };
    } catch (error) {
      console.error("Error during license compliance check:", error);
      throw error;
    }
  }

  private async getPackageInfo(): Promise<PackageInfo[]> {
    try {
      // Use bun pm ls to get dependency list with versions
      const proc = Bun.spawn(["bun", "pm", "ls", "--all", "--depth=0"], {
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      });

      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        const errorOutput = await new Response(proc.stderr).text();
        throw new Error(`bun pm ls failed: ${errorOutput}`);
      }

      return await this.parseBunLsOutput(output);
    } catch (error) {
      console.error("Failed to get package information:", error);
      throw error;
    }
  }

  private async parseBunLsOutput(output: string): Promise<PackageInfo[]> {
    const packages: PackageInfo[] = [];
    const lines = output.split("\n");

    for (const line of lines) {
      // Parse lines like "├── package-name@version"
      const match = line.match(/[├└]── (.+?)@(.+?)(?:\s|$)/);
      if (match) {
        const [, name, version] = match;

        // Skip packages in exclude list
        if (
          this.policy.excludePackages.some(
            (excluded) => name.includes(excluded) || excluded.includes(name)
          )
        ) {
          continue;
        }

        packages.push({
          name: name.trim(),
          version: version.trim(),
          license: await this.getLicenseFromPackage(name, version),
        });
      }
    }

    return packages;
  }

  private async getLicenseFromPackage(name: string, _version: string): Promise<string | undefined> {
    try {
      // Try to read package.json from node_modules
      const packageJsonPath = `node_modules/${name}/package.json`;
      const file = Bun.file(packageJsonPath);

      if (await file.exists()) {
        const packageJson = await file.json();
        return packageJson.license || packageJson.licenses?.[0]?.type || "Unknown";
      }

      return "Unknown";
    } catch {
      return "Unknown";
    }
  }

  private checkPackageLicense(pkg: PackageInfo): LicenseViolation | null {
    const { name, version, license } = pkg;

    if (!license || license === "Unknown") {
      return {
        package: name,
        version,
        license: license || "Unknown",
        severity: "warning",
        message: `Package ${name}@${version} has unknown or missing license information`,
      };
    }

    // Check if license is in allowed list
    const normalizedLicense = license.trim();
    const isAllowed = this.policy.allowedLicenses.some(
      (allowed) =>
        normalizedLicense === allowed ||
        normalizedLicense.includes(allowed) ||
        this.isCompatibleLicense(normalizedLicense, allowed)
    );

    if (!isAllowed) {
      // Check for problematic licenses (AGPL, GPL-3.0, etc.)
      const isProblematic = /AGPL|GPL-3|GPL\s*v?3/i.test(normalizedLicense);

      return {
        package: name,
        version,
        license: normalizedLicense,
        severity: isProblematic ? "error" : "warning",
        message: isProblematic
          ? `Package ${name}@${version} uses problematic license: ${normalizedLicense}`
          : `Package ${name}@${version} uses non-allowed license: ${normalizedLicense}`,
      };
    }

    return null;
  }

  private isCompatibleLicense(packageLicense: string, allowedLicense: string): boolean {
    // Handle common license variations
    const compatibilityMap: Record<string, string[]> = {
      MIT: ["MIT", "X11", "Expat"],
      "Apache-2.0": ["Apache 2.0", "Apache-2.0", "Apache License 2.0"],
      "BSD-3-Clause": ["BSD-3-Clause", "BSD 3-Clause", "New BSD", "Modified BSD"],
      "BSD-2-Clause": ["BSD-2-Clause", "BSD 2-Clause", "Simplified BSD", "FreeBSD"],
      ISC: ["ISC", "Internet Systems Consortium"],
      "0BSD": ["0BSD", "Zero-Clause BSD", "Free Public License 1.0.0"],
    };

    const variants = compatibilityMap[allowedLicense] || [allowedLicense];
    return variants.some((variant) => packageLicense.toLowerCase().includes(variant.toLowerCase()));
  }

  generateReport(violations: LicenseViolation[], totalPackages: number): string {
    const errors = violations.filter((v) => v.severity === "error");
    const warnings = violations.filter((v) => v.severity === "warning");

    let report = `\nLicense Compliance Report\n`;
    report += `${"=".repeat(50)}\n`;
    report += `Total packages analyzed: ${totalPackages}\n`;
    report += `Compliant packages: ${totalPackages - violations.length}\n`;
    report += `License warnings: ${warnings.length}\n`;
    report += `License violations: ${errors.length}\n\n`;

    if (errors.length > 0) {
      report += `License Violations (${errors.length}):\n`;
      report += `${"-".repeat(40)}\n`;
      for (const error of errors) {
        report += `• ${error.package}@${error.version}\n`;
        report += `  License: ${error.license}\n`;
        report += `  Issue: ${error.message}\n\n`;
      }
    }

    if (warnings.length > 0) {
      report += `License Warnings (${warnings.length}):\n`;
      report += `${"-".repeat(40)}\n`;
      for (const warning of warnings) {
        report += `• ${warning.package}@${warning.version}\n`;
        report += `  License: ${warning.license}\n`;
        report += `  Issue: ${warning.message}\n\n`;
      }
    }

    if (violations.length === 0) {
      report += `All packages comply with license policy!\n\n`;
    }

    report += `Allowed Licenses:\n`;
    for (const license of this.policy.allowedLicenses) {
      report += `  • ${license}\n`;
    }

    return report;
  }
}

async function main() {
  const startTime = performance.now();

  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const verbose = args.includes("--verbose") || args.includes("-v");
    const jsonOutput = args.includes("--json");
    const failOnWarnings = args.includes("--fail-on-warnings");

    // Define license policy (matching current workflow configuration)
    const policy: LicensePolicy = {
      allowedLicenses: [
        "MIT",
        "Apache-2.0",
        "BSD-3-Clause",
        "BSD-3-Clause-Clear",
        "ISC",
        "BSD-2-Clause",
        "0BSD",
        "Unlicense",
        "UNLICENSED",
        "CC0-1.0",
        "CC-BY-3.0",
        "CC-BY-4.0",
        "WTFPL",
        "Python-2.0",
        "MIT OR Apache-2.0",
      ],
      excludePackages: ["authentication-service@2.4.0"],
      projectName: "authentication-service",
    };

    // Run license compliance check
    const checker = new BunLicenseChecker(policy, verbose);
    const { violations, totalPackages } = await checker.checkCompliance();

    const endTime = performance.now();
    const executionTime = ((endTime - startTime) / 1000).toFixed(2);

    // Handle output format
    if (jsonOutput) {
      const result = {
        summary: {
          totalPackages,
          compliantPackages: totalPackages - violations.length,
          violations: violations.length,
          errors: violations.filter((v) => v.severity === "error").length,
          warnings: violations.filter((v) => v.severity === "warning").length,
          executionTimeSeconds: Number.parseFloat(executionTime),
        },
        violations,
        policy,
      };
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Generate and display report
      const report = checker.generateReport(violations, totalPackages);
      console.log(report);

      if (verbose) {
        console.log(`Execution time: ${executionTime}s`);
      }
    }

    // Set appropriate exit code
    const errors = violations.filter((v) => v.severity === "error");
    const warnings = violations.filter((v) => v.severity === "warning");

    if (errors.length > 0) {
      console.error(`\nFound ${errors.length} license violations`);
      process.exit(1);
    }

    if (failOnWarnings && warnings.length > 0) {
      console.error(
        `\nFound ${warnings.length} license warnings (failing due to --fail-on-warnings)`
      );
      process.exit(1);
    }

    if (verbose) {
      console.log("\nLicense compliance check completed successfully");
    }
  } catch (error) {
    console.error("License compliance check failed:", error);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.main) {
  main();
}

export { BunLicenseChecker, type LicensePolicy, type LicenseViolation };
