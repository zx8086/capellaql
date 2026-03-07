/* test/k6/data/test-data-loader.ts */

import { SharedArray } from "k6/data";
import { createRandomSelector } from "../utils/graphql-helpers.ts";

// Load test data using SharedArray for memory efficiency
export const brands = new SharedArray("brands", () => JSON.parse(open("./brands.json")));

const queriesData = JSON.parse(open("./queries.json"));
export const queries = new SharedArray("queries", () =>
  Object.entries(queriesData).map(([name, data]) => ({ name, ...(data as Record<string, unknown>) }))
);

const scenariosData = JSON.parse(open("./test-scenarios.json"));
export const scenarios = new SharedArray("test-scenarios", () =>
  Object.entries(scenariosData).map(([name, data]) => ({ name, ...(data as Record<string, unknown>) }))
);

// Create selectors for randomization
export const brandSelector = createRandomSelector(brands);
export const seasonSelector = createRandomSelector(["C51", "C52"]);

export const divisionSelector = () => {
  const brand = brandSelector();
  return createRandomSelector(brand.divisions)();
};

export const primaryDivisionSelector = () => {
  const brand = brandSelector();
  return createRandomSelector(brand.primaryDivisions)();
};

export const salesOrgCodeSelector = createRandomSelector(["US01", "US02", "EU01", "EU02", "ASIA01"]);

export const multiDivisionSelector = () => {
  const allDivisions = brands.flatMap((brand: any) => brand.divisions);
  return allDivisions.sort(() => 0.5 - Math.random()).slice(0, 3);
};

// Variable generators for each query type
export const generateLooksSummaryVariables = () => {
  const brand = brandSelector();
  return {
    brand: brand.name,
    division: createRandomSelector(brand.divisions)(),
    season: seasonSelector(),
  };
};

export const generateLooksVariables = () => {
  const brand = brandSelector();
  return {
    brand: brand.name,
    division: createRandomSelector(brand.divisions)(),
    season: seasonSelector(),
  };
};

export const generateSeasonalAssignmentsVariables = () => ({
  styleSeasonCode: seasonSelector(),
});

export const generateImageUrlCheckVariables = () => ({
  divisions: multiDivisionSelector(),
  season: seasonSelector(),
});

export const generateOptionsSummaryVariables = () => {
  const brand = brandSelector();
  return {
    SalesOrganizationCode: salesOrgCodeSelector(),
    StyleSeasonCode: seasonSelector(),
    DivisionCode: createRandomSelector(brand.divisions)(),
    ActiveOption: true,
    SalesChannels: ["SELLIN", "B2B"],
  };
};

export const generateOptionsProductViewVariables = () => {
  const brand = brandSelector();
  return {
    BrandCode: brand.name,
    SalesOrganizationCode: salesOrgCodeSelector(),
    StyleSeasonCode: seasonSelector(),
    DivisionCode: createRandomSelector(brand.divisions)(),
    ActiveOption: true,
    SalesChannels: ["SELLIN", "B2B"],
  };
};

export const generateImageDetailsVariables = () => {
  const brand = brandSelector();
  return {
    divisionCode: createRandomSelector(brand.divisions)(),
    styleSeasonCode: seasonSelector(),
  };
};

// Variable generator mapping
export const variableGenerators: Record<string, () => any> = {
  looksSummary: generateLooksSummaryVariables,
  looks: generateLooksVariables,
  getAllSeasonalAssignments: generateSeasonalAssignmentsVariables,
  getImageUrlCheck: generateImageUrlCheckVariables,
  optionsSummary: generateOptionsSummaryVariables,
  optionsProductView: generateOptionsProductViewVariables,
  imageDetails: generateImageDetailsVariables,
};

export const getQueryWithVariables = (operationName: string) => {
  const queryData = queries.find((q: any) => q.name === operationName);
  if (!queryData) {
    throw new Error(`Query '${operationName}' not found`);
  }

  const generator = variableGenerators[operationName];

  if (!generator) {
    throw new Error(`Variable generator for '${operationName}' not found`);
  }

  return {
    query: queryData.query,
    variables: generator(),
    complexity: queryData.complexity,
    expectedFields: queryData.expectedFields,
  };
};

// Scenario-based test data generators
export const getScenarioStep = (scenarioName: string) => {
  const scenario = scenarios.find((s: any) => s.name === scenarioName);
  if (!scenario) {
    throw new Error(`Scenario '${scenarioName}' not found`);
  }

  // Weighted random selection
  const totalWeight = scenario.steps.reduce((sum: number, step: any) => sum + step.weight, 0);
  let randomValue = Math.random() * totalWeight;

  for (const step of scenario.steps) {
    randomValue -= step.weight;
    if (randomValue <= 0) {
      return step;
    }
  }

  // Fallback to first step
  return scenario.steps[0];
};

export const getAllOperations = (): string[] => {
  return Object.keys(variableGenerators);
};
