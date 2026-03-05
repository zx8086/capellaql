#!/usr/bin/env bun
// scripts/convert-trufflehog-to-sarif.ts

import { readFileSync, writeFileSync } from "node:fs";

interface TruffleHogFinding {
  SourceMetadata?: {
    Data?: {
      Git?: {
        file?: string;
        commit?: string;
        timestamp?: string;
      };
    };
  };
  SourceID?: number;
  SourceType?: number;
  SourceName?: string;
  DetectorType?: number;
  DetectorName?: string;
  DecoderName?: string;
  Verified?: boolean;
  Raw?: string;
  Redacted?: string;
  ExtraData?: Record<string, unknown>;
  StructuredData?: Record<string, unknown>;
}

interface SARIFResult {
  ruleId: string;
  level: "error" | "warning" | "note";
  message: {
    text: string;
  };
  locations: Array<{
    physicalLocation: {
      artifactLocation: {
        uri: string;
      };
      region?: {
        startLine: number;
      };
    };
  }>;
  partialFingerprints: {
    primaryLocationLineHash: string;
  };
}

interface SARIFReport {
  version: "2.1.0";
  $schema: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version: string;
        informationUri: string;
        rules: Array<{
          id: string;
          name: string;
          shortDescription: {
            text: string;
          };
          fullDescription: {
            text: string;
          };
          help: {
            text: string;
          };
          properties: {
            tags: string[];
            precision: string;
            "security-severity": string;
          };
        }>;
      };
    };
    results: SARIFResult[];
  }>;
}

function convertToSARIF(truffleHogOutput: string): SARIFReport {
  const findings: TruffleHogFinding[] = [];

  // Parse NDJSON (newline-delimited JSON)
  const lines = truffleHogOutput.trim().split("\n");
  for (const line of lines) {
    if (line.trim()) {
      try {
        findings.push(JSON.parse(line));
      } catch (error) {
        console.error(`Failed to parse line: ${line}`, error);
      }
    }
  }

  const results: SARIFResult[] = [];
  const rules = new Map<
    string,
    {
      id: string;
      name: string;
      description: string;
    }
  >();

  for (const finding of findings) {
    const detectorName = finding.DetectorName || "Unknown";
    const ruleId = `trufflehog/${detectorName.toLowerCase().replace(/\s+/g, "-")}`;

    // Track unique rules
    if (!rules.has(ruleId)) {
      rules.set(ruleId, {
        id: ruleId,
        name: detectorName,
        description: `Potential ${detectorName} credential detected`,
      });
    }

    const file = finding.SourceMetadata?.Data?.Git?.file || "unknown-file";
    const verified = finding.Verified ? "VERIFIED" : "UNVERIFIED";
    const redacted = finding.Redacted || "(redacted)";

    results.push({
      ruleId,
      level: finding.Verified ? "error" : "warning",
      message: {
        text: `${verified} ${detectorName} secret found: ${redacted}`,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: file,
            },
          },
        },
      ],
      partialFingerprints: {
        primaryLocationLineHash: `${file}:${detectorName}:${redacted}`.substring(0, 32),
      },
    });
  }

  const sarif: SARIFReport = {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "TruffleHog",
            version: "3.82.6",
            informationUri: "https://github.com/trufflesecurity/trufflehog",
            rules: Array.from(rules.values()).map((rule) => ({
              id: rule.id,
              name: rule.name,
              shortDescription: {
                text: rule.description,
              },
              fullDescription: {
                text: `${rule.description}. TruffleHog scans for leaked credentials in git repositories, filesystems, and more.`,
              },
              help: {
                text: `Review the detected secret and rotate it immediately if verified. Remove from git history if committed.`,
              },
              properties: {
                tags: ["security", "secrets", "credentials"],
                precision: "high",
                "security-severity": "8.0",
              },
            })),
          },
        },
        results,
      },
    ],
  };

  return sarif;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.error("Usage: bun scripts/convert-trufflehog-to-sarif.ts <input.json> <output.sarif>");
    process.exit(1);
  }

  const [inputFile, outputFile] = args;

  try {
    console.log(`Reading TruffleHog output from: ${inputFile}`);
    const truffleHogOutput = readFileSync(inputFile, "utf-8");

    console.log(`Converting to SARIF format...`);
    const sarif = convertToSARIF(truffleHogOutput);

    console.log(`Writing SARIF output to: ${outputFile}`);
    writeFileSync(outputFile, JSON.stringify(sarif, null, 2));

    console.log(`Conversion complete. Found ${sarif.runs[0].results.length} secrets.`);
    process.exit(0);
  } catch (error) {
    console.error("Error converting TruffleHog output to SARIF:", error);
    process.exit(1);
  }
}

main();
