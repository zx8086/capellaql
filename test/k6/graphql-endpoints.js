/* test/k6/graphql-endpoints.js */

import { check, sleep } from "k6";
import http from "k6/http";
import { Counter } from "k6/metrics";

const errors = new Counter("errors");

const GRAPHQL_ENDPOINT = "http://localhost:4000/graphql";

const LOOKS_SUMMARY_QUERY = `
query looksSummary($brand: String!, $division: String!, $season: String!) {
  looksSummary(brand: $brand, division: $division, season: $season) {
    hasDeliveryName
    hasDescription
    hasGender
    hasRelatedStyles
    hasTag
    hasTitle
    hasTrend
    totalLooks
  }
}
`;

const GET_ALL_SEASONAL_ASSIGNMENTS_QUERY = `
query getAllSeasonalAssignments($styleSeasonCode: String!) {
  getAllSeasonalAssignments(styleSeasonCode: $styleSeasonCode) {
    brand
    brandName
    channels
    companyCode
    createdOn
    divisions {
      code
      isActive
      name
    }
    fms {
      season {
        code
        name
      }
      year
    }
    modifiedOn
    name
    salesOrganizationCodes
    styleSeasonCode
  }
}
`;

const GET_IMAGE_URL_CHECK_QUERY = `
query getImageUrlCheck($divisions: [String!]!, $season: String!) {
  getImageUrlCheck(divisions: $divisions, season: $season) {
    divisionCode
    urls
  }
}
`;

const brands = [
  {
    name: "TH",
    divisions: ["01", "02", "03", "04", "05", "07", "08", "09", "10", "11", "18"],
  },
  {
    name: "CK",
    divisions: ["61", "62", "63", "64", "65", "67", "68", "69", "70", "71", "72", "77", "96"],
  },
];

const seasons = ["C51", "C52"];

const commonHeaders = {
  "Content-Type": "application/json",
  "User-Agent": "K6TestAgent/1.0",
};

export const options = {
  scenarios: {
    looksSummary: {
      executor: "ramping-vus",
      stages: [
        { duration: "30s", target: 5 }, // Warm-up
        { duration: "1m", target: 10 }, // Ramp-up
        { duration: "2m", target: 10 }, // Steady state
        { duration: "30s", target: 0 }, // Ramp-down
      ],
      exec: "runLooksSummaryScenario",
    },
    seasonalAssignments: {
      executor: "ramping-vus",
      stages: [
        { duration: "30s", target: 5 }, // Warm-up
        { duration: "1m", target: 10 }, // Ramp-up
        { duration: "2m", target: 10 }, // Steady state
        { duration: "30s", target: 0 }, // Ramp-down
      ],
      exec: "runSeasonalAssignmentsScenario",
    },
    // imageUrlCheck: {
    //   executor: "ramping-vus",
    //   stages: [
    //     { duration: "30s", target: 5 }, // Warm-up
    //     { duration: "1m", target: 10 }, // Ramp-up
    //     { duration: "2m", target: 10 }, // Steady state
    //     { duration: "30s", target: 0 }, // Ramp-down
    //   ],
    //   exec: "runImageUrlCheckScenario",
    // },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"], // http errors should be less than 1%
    http_req_duration: ["p(95)<400"], // 95% of requests should be below 400ms
  },
  userAgent: "K6TestAgent/1.0",
  throw: true,
};

export function runLooksSummaryScenario() {
  const brand = brands[Math.floor(Math.random() * brands.length)];
  const division = brand.divisions[Math.floor(Math.random() * brand.divisions.length)];
  const season = seasons[Math.floor(Math.random() * seasons.length)];

  const payload = JSON.stringify({
    query: LOOKS_SUMMARY_QUERY,
    variables: {
      brand: brand.name,
      division: division,
      season: season,
    },
  });

  const params = {
    headers: commonHeaders,
    tags: {
      testType: "graphql",
      operation: "looksSummary",
    },
    timeout: "30s",
  };

  const response = http.post(GRAPHQL_ENDPOINT, payload, params);

  check(response, {
    "is status 200": (r) => r.status === 200,
    "is valid JSON": (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (e) {
        console.error(`Invalid JSON response for looksSummary: ${r.body}`);
        return false;
      }
    },
    "no errors in response": (r) => {
      try {
        const jsonResponse = JSON.parse(r.body);
        return !jsonResponse.errors;
      } catch (e) {
        return false;
      }
    },
    "has looksSummary data": (r) => {
      try {
        const jsonResponse = JSON.parse(r.body);
        return jsonResponse.data && jsonResponse.data.looksSummary !== null;
      } catch (e) {
        return false;
      }
    },
  });

  if (response.status !== 200) {
    errors.add(1);
    console.error(`HTTP ${response.status} for looksSummary: ${response.body}`);
    console.error(`Request payload: ${payload}`);
  }
}

export function runSeasonalAssignmentsScenario() {
  const payload = JSON.stringify({
    query: GET_ALL_SEASONAL_ASSIGNMENTS_QUERY,
    variables: {
      styleSeasonCode: "C52",
    },
  });

  const params = {
    headers: commonHeaders,
    tags: {
      testType: "graphql",
      operation: "seasonalAssignments",
    },
    timeout: "30s",
  };

  const response = http.post(GRAPHQL_ENDPOINT, payload, params);

  check(response, {
    "is status 200": (r) => r.status === 200,
    "is valid JSON": (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (e) {
        console.error(`Invalid JSON response for getAllSeasonalAssignments: ${r.body}`);
        return false;
      }
    },
    "no errors in response": (r) => {
      try {
        const jsonResponse = JSON.parse(r.body);
        return !jsonResponse.errors;
      } catch (e) {
        return false;
      }
    },
    "has getAllSeasonalAssignments data": (r) => {
      try {
        const jsonResponse = JSON.parse(r.body);
        return jsonResponse.data && jsonResponse.data.getAllSeasonalAssignments !== null;
      } catch (e) {
        return false;
      }
    },
  });

  if (response.status !== 200) {
    console.error(`HTTP ${response.status} for getAllSeasonalAssignments: ${response.body}`);
  }
}

export function runImageUrlCheckScenario() {
  const allDivisions = brands.flatMap((brand) => brand.divisions);
  const randomDivisions = allDivisions.sort(() => 0.5 - Math.random()).slice(0, 3);

  const payload = JSON.stringify({
    query: GET_IMAGE_URL_CHECK_QUERY,
    variables: {
      divisions: randomDivisions,
      season: seasons[Math.floor(Math.random() * seasons.length)],
    },
  });

  const params = {
    headers: commonHeaders,
    tags: {
      testType: "graphql",
      operation: "imageUrlCheck",
    },
  };

  const response = http.post(GRAPHQL_ENDPOINT, payload, params);

  check(response, {
    "is status 200": (r) => r.status === 200,
    "is valid JSON": (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch (e) {
        console.error(`Invalid JSON response for getImageUrlCheck: ${r.body}`);
        return false;
      }
    },
    "no errors in response": (r) => {
      try {
        const jsonResponse = JSON.parse(r.body);
        return !jsonResponse.errors;
      } catch (e) {
        return false;
      }
    },
    "has getImageUrlCheck data": (r) => {
      try {
        const jsonResponse = JSON.parse(r.body);
        return jsonResponse.data && jsonResponse.data.getImageUrlCheck !== null;
      } catch (e) {
        return false;
      }
    },
  });

  if (response.status !== 200) {
    console.error(`HTTP ${response.status} for getImageUrlCheck: ${response.body}`);
  }
}
