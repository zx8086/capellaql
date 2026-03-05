# GraphQL API Reference

## Overview

CapellaQL provides a GraphQL API for accessing fashion product data from Couchbase Capella. The API supports queries for looks, options, images, and seasonal assignments.

**Endpoint:** `POST /graphql`

## Quick Start

```graphql
# Example: Fetch looks summary for a brand and season
query {
  looksSummary(brand: "TH", season: "SS25", division: "MENSWEAR") {
    totalLooks
    hasTitle
    hasTrend
  }
}
```

## Queries

### looksSummary

Returns aggregated statistics about looks for a given brand, season, and division.

```graphql
query LooksSummary($brand: String, $season: String, $division: String) {
  looksSummary(brand: $brand, season: $season, division: $division) {
    totalLooks
    hasTitle
    hasTrend
    hasDescription
    hasGender
    hasRelatedStyles
    hasTag
    hasDeliveryName
  }
}
```

**Arguments:**
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| brand | String | No | Brand code (e.g., "TH", "CK") |
| season | String | No | Season code (e.g., "SS25", "FW24") |
| division | String | No | Division name (e.g., "MENSWEAR", "WOMENSWEAR") |

**Response Type:** `LookSummary`

---

### looks

Returns a list of looks matching the filter criteria.

```graphql
query Looks($brand: String, $season: String, $division: String) {
  looks(brand: $brand, season: $season, division: $division) {
    documentKey
    divisionCode
    lookType
    assetUrl
    title
    trend
    relatedStyles
    isDeleted
  }
}
```

**Arguments:**
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| brand | String | No | Brand code |
| season | String | No | Season code |
| division | String | No | Division name |

**Response Type:** `[Look]`

---

### lookDetails

Returns detailed information about a specific look.

```graphql
query LookDetails($lookDocKey: String!) {
  lookDetails(lookDocKey: $lookDocKey) {
    lookId
    assetUrl
    brand
    channels
    deliveryName
    description
    divisionCode
    gender
    isDeleted
    lookType
    position
    relatedStyles
    tag
    title
    trend
    createdOn
    modifiedOn
  }
}
```

**Arguments:**
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| lookDocKey | String! | Yes | Unique document key for the look |

**Response Type:** `LookDetails`

---

### optionsSummary

Returns aggregated statistics about product options.

```graphql
query OptionsSummary(
  $SalesOrganizationCode: String!
  $StyleSeasonCode: String!
  $DivisionCode: String!
  $ActiveOption: Boolean!
  $SalesChannels: [SalesChannel!]!
) {
  optionsSummary(
    SalesOrganizationCode: $SalesOrganizationCode
    StyleSeasonCode: $StyleSeasonCode
    DivisionCode: $DivisionCode
    ActiveOption: $ActiveOption
    SalesChannels: $SalesChannels
  ) {
    totalOptions
    hasImages
    hasFrontImageUrl
    isActive
    isAvailable
    isCancelled
    isClosed
    isInvalid
    isLicensed
    isNew
    isSoldOut
    isUpdated
    isOpenForEcom
    hasDeliveryDates
  }
}
```

**Arguments:**
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| SalesOrganizationCode | String! | Yes | Sales organization code |
| StyleSeasonCode | String! | Yes | Style season code (e.g., "SS25") |
| DivisionCode | String! | Yes | Division code |
| ActiveOption | Boolean! | Yes | Filter by active status |
| SalesChannels | [SalesChannel!]! | Yes | List of sales channels (SELLIN, B2B) |

**Response Type:** `OptionSummary`

---

### optionsProductView

Returns product options with image and availability information.

```graphql
query OptionsProductView(
  $BrandCode: String!
  $SalesOrganizationCode: String!
  $StyleSeasonCode: String!
  $DivisionCode: String!
  $ActiveOption: Boolean!
  $SalesChannels: [SalesChannel!]!
) {
  optionsProductView(
    BrandCode: $BrandCode
    SalesOrganizationCode: $SalesOrganizationCode
    StyleSeasonCode: $StyleSeasonCode
    DivisionCode: $DivisionCode
    ActiveOption: $ActiveOption
    SalesChannels: $SalesChannels
  ) {
    activeOption
    divisionCode
    brandCode
    optionCode
    description
    styleDescription
    internal_id
    images
    imageUrl
    isAvailable
    isCancelled
    isClosed
    isInvalid
    isLicensed
    isNew
    isSoldOut
    isUpdated
    isOpenForEcom
    hasDeliveryDropDate
    hasImageDocument
  }
}
```

**Arguments:**
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| BrandCode | String! | Yes | Brand code (e.g., "TH", "CK") |
| SalesOrganizationCode | String! | Yes | Sales organization code |
| StyleSeasonCode | String! | Yes | Style season code |
| DivisionCode | String! | Yes | Division code |
| ActiveOption | Boolean! | Yes | Filter by active status |
| SalesChannels | [SalesChannel!]! | Yes | List of sales channels |

**Response Type:** `[OptionProductView]`

---

### imageDetails

Returns image URLs and metadata for a specific style.

```graphql
query ImageDetails(
  $divisionCode: String!
  $styleSeasonCode: String!
  $styleCode: String!
) {
  imageDetails(
    divisionCode: $divisionCode
    styleSeasonCode: $styleSeasonCode
    styleCode: $styleCode
  ) {
    imageKey
    frontUrl
    frontModifiedOn
    backUrl
    backModifiedOn
    detailUrl
    detailModifiedOn
    fabricScanUrl
    gridUrl
    sketchUrl
    i360Url
  }
}
```

**Arguments:**
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| divisionCode | String! | Yes | Division code |
| styleSeasonCode | String! | Yes | Style season code |
| styleCode | String! | Yes | Style code |

**Response Type:** `ImageDetails`

---

### getImageUrlCheck

Validates image URLs for multiple divisions and a season.

```graphql
query GetImageUrlCheck($divisions: [String!]!, $season: String!) {
  getImageUrlCheck(divisions: $divisions, season: $season) {
    divisionCode
    urls
  }
}
```

**Arguments:**
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| divisions | [String!]! | Yes | List of division codes |
| season | String! | Yes | Season code |

**Response Type:** `[UrlSuffixesResult!]!`

---

### getLooksUrlCheck

Validates look URLs for multiple divisions and a season.

```graphql
query GetLooksUrlCheck($divisions: [String!]!, $season: String!) {
  getLooksUrlCheck(divisions: $divisions, season: $season) {
    divisionCode
    urls
  }
}
```

**Arguments:**
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| divisions | [String!]! | Yes | List of division codes |
| season | String! | Yes | Season code |

**Response Type:** `[UrlSuffixesResult!]!`

---

### searchDocuments

Searches for documents across multiple collections by keys.

```graphql
query SearchDocuments(
  $collections: [BucketScopeCollection!]!
  $keys: [String!]!
) {
  searchDocuments(collections: $collections, keys: $keys) {
    bucket
    scope
    collection
    data
    timeTaken
  }
}
```

**Arguments:**
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| collections | [BucketScopeCollection!]! | Yes | List of bucket/scope/collection targets |
| keys | [String!]! | Yes | Document keys to search for |

**Input Type:** `BucketScopeCollection`
```graphql
input BucketScopeCollection {
  bucket: String!
  scope: String!
  collection: String!
}
```

**Response Type:** `[DocumentResult!]!`

---

### getAllSeasonalAssignments

Returns all seasonal assignments for a style season.

```graphql
query GetAllSeasonalAssignments(
  $styleSeasonCode: String!
  $companyCode: String
  $isActive: Boolean
) {
  getAllSeasonalAssignments(
    styleSeasonCode: $styleSeasonCode
    companyCode: $companyCode
    isActive: $isActive
  ) {
    name
    brand
    brandName
    styleSeasonCode
    companyCode
    channels
    salesOrganizationCodes
    divisions {
      name
      code
      isActive
    }
    fms {
      year
      season {
        code
        name
      }
    }
    createdOn
    modifiedOn
  }
}
```

**Arguments:**
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| styleSeasonCode | String! | Yes | Style season code |
| companyCode | String | No | Filter by company code |
| isActive | Boolean | No | Filter by active status |

**Response Type:** `[SeasonalAssignment!]!`

---

### getDivisionAssignment

Returns a specific division's seasonal assignment.

```graphql
query GetDivisionAssignment(
  $styleSeasonCode: String!
  $companyCode: String!
  $divisionCode: String!
) {
  getDivisionAssignment(
    styleSeasonCode: $styleSeasonCode
    companyCode: $companyCode
    divisionCode: $divisionCode
  ) {
    name
    brand
    brandName
    styleSeasonCode
    companyCode
    channels
    salesOrganizationCodes
    division {
      name
      code
      isActive
    }
    fms {
      year
      season {
        code
        name
      }
    }
    createdOn
    modifiedOn
  }
}
```

**Arguments:**
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| styleSeasonCode | String! | Yes | Style season code |
| companyCode | String! | Yes | Company code |
| divisionCode | String! | Yes | Division code |

**Response Type:** `SeasonalDivisionalAssignment`

---

## Enums

### SalesChannel

```graphql
enum SalesChannel {
  SELLIN
  B2B
}
```

## Types Reference

### Look
```graphql
type Look {
  documentKey: String
  divisionCode: String
  lookType: Int
  assetUrl: String
  title: String
  trend: String
  relatedStyles: [String]
  isDeleted: Boolean
}
```

### LookSummary
```graphql
type LookSummary {
  hasDeliveryName: Int
  hasDescription: Int
  hasGender: Int
  hasRelatedStyles: Int
  hasTag: Int
  hasTitle: Int
  hasTrend: Int
  totalLooks: Int
}
```

### OptionSummary
```graphql
type OptionSummary {
  totalOptions: Int!
  hasImages: Int!
  hasFrontImageUrl: Int!
  isActive: Int!
  isAvailable: Int!
  isCancelled: Int!
  isClosed: Int!
  isInvalid: Int!
  isLicensed: Int!
  isNew: Int!
  isSoldOut: Int!
  isUpdated: Int!
  isOpenForEcom: Int!
  hasDeliveryDates: Int!
}
```

### OptionProductView
```graphql
type OptionProductView {
  activeOption: Boolean
  divisionCode: String
  brandCode: String
  optionCode: String
  description: String
  styleDescription: String
  internal_id: String
  images: String
  imageUrl: String
  isAvailable: Boolean
  isCancelled: Boolean
  isClosed: Boolean
  isInvalid: Boolean
  isLicensed: Boolean
  isNew: Boolean
  isSoldOut: Boolean
  isUpdated: Boolean
  isOpenForEcom: Boolean
  hasDeliveryDropDate: Boolean
  hasImageDocument: Boolean
}
```

### ImageDetails
```graphql
type ImageDetails {
  imageKey: String!
  backUrl: String
  backModifiedOn: String
  detailUrl: String
  detailModifiedOn: String
  fabricScanUrl: String
  fabricScanModifiedOn: String
  frontUrl: String
  frontModifiedOn: String
  gridUrl: String
  gridModifiedOn: String
  i360Url: String
  i360ModifiedOn: String
  imageUrl: String
  imageModifiedOn: String
  insideUrl: String
  insideModifiedOn: String
  packageUrl: String
  packageModifiedOn: String
  sketchUrl: String
  sketchModifiedOn: String
}
```

### LookDetails
```graphql
type LookDetails {
  assetUrl: String
  brand: String
  channels: [String]
  createdOn: String
  deliveryName: String
  description: String
  divisionCode: String
  gender: String
  isDeleted: Boolean
  lookId: String
  lookType: Int
  modifiedOn: String
  position: Int
  relatedStyles: [String]
  tag: String
  title: String
  trend: String
}
```

### SeasonalAssignment
```graphql
type SeasonalAssignment {
  channels: [String!]!
  divisions: [Division!]!
  salesOrganizationCodes: [String!]!
  companyCode: String!
  name: String!
  brand: String!
  brandName: String!
  styleSeasonCode: String!
  fms: FMS!
  createdOn: String!
  modifiedOn: String!
}
```

### Division
```graphql
type Division {
  name: String!
  code: String!
  isActive: Boolean!
}
```

### FMS
```graphql
type FMS {
  season: [FMSSeason!]!
  year: String!
}

type FMSSeason {
  code: String!
  name: String!
}
```

## Error Handling

GraphQL errors follow the standard GraphQL error format with extensions:

```json
{
  "errors": [
    {
      "message": "Document not found",
      "path": ["lookDetails"],
      "extensions": {
        "code": "NOT_FOUND",
        "service": "CapellaQL"
      }
    }
  ],
  "data": null
}
```

## Performance Tips

1. **Request only needed fields** - GraphQL allows you to specify exactly which fields you need
2. **Use batching** - Combine multiple queries in a single request when possible
3. **Leverage caching** - The API includes response caching for frequently accessed data
4. **Use variables** - Parameterize queries for better caching and security

## Related Documentation

- [REST Endpoints](endpoints.md) - Health and metrics endpoints
- [OpenAPI Specification](openapi.yaml) - Full API specification
- [Architecture Overview](../architecture/overview.md) - System design
