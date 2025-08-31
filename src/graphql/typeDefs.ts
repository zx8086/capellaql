/* src/graphql/typeDefs.ts */

import { gql } from "graphql-tag";

const typeDefs = gql`
  enum SalesChannel {
    SELLIN
    B2B
  }

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

  type Status {
    code: String
    description: String
    isAvailable: Boolean
    isCancelled: Boolean
    isClosed: Boolean
    isInvalid: Boolean
    isSoldOut: Boolean
  }

  type Size {
    EAN: String
    index: Int
    name: String
    pimVariantKeyNo: String
    sapVariant: String
    status: Status
  }

  type SizeSet {
    sizes: [Size]
  }

  type Inseam {
    null: SizesMap
  }

  type SizesMap {
    sizes: [Size]
  }

  type Dimensions {
    heelHeight: Int
    height: Int
    length: Int
    shaftHeight: Int
    width: Int
  }

  type Theme {
    name: String
  }

  type PimDeliveryDates {
    additionalDeliveryDate: String
    adjustedDeliveryDate: String
    dropDate: Float
    modifiedOn: String
  }

  type MerchandisingHierarchy {
    business: String
    category: String
    code: String
    gender: String
    lifestyle: String
    productgroup: String
    productsubgroup: String
    world: String
  }

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

  type OptionFull {
    activeOption: Boolean
    brandCode: String
    certificationStyles: [String]
    channels: [String]
    collection: String
    collectionStructure: String
    color: String
    colorDescription1: String
    colorDescription2: String
    consumerAssortment: String
    consumerAssortmentCode: String
    copiedFromOption: String
    countryOfOrigin: String
    ctpMonth: String
    description: String
    descriptions: String
    dimensions: Dimensions
    distribution: String
    divisionCode: String
    documentType: String
    fabric: String
    fashionability: String
    fashionabilityCode: String
    fit: String
    fitForBottoms: String
    fitForTops: String
    fmsCollectionCode: String
    fmsMainSeasonCode: String
    garmentLength: String
    hasSustainableMaterials: Boolean
    hexCode: String
    images: String
    innovation: Boolean
    innovationAttributes: String
    inseams: Inseam
    internalStyleName: String
    internal_id: String
    isAvailable: Boolean
    isCancelled: Boolean
    isClosed: Boolean
    isInvalid: Boolean
    isLicensed: Boolean
    isNew: Boolean
    isSoldOut: Boolean
    isUpdated: Boolean
    keyLook: String
    label: String
    llo: Int
    mainSeason: String
    merchandisingHierarchy: MerchandisingHierarchy
    neckline: String
    openForEcom: Boolean
    optionCode: String
    optionType: String
    originatingProductLine: String
    originatingProductLineCode: String
    packingType: String
    pimDeliveryDates: PimDeliveryDates
    pimOptionKeyNo: String
    pimProductKeyNo: String
    prepackSizeOffer: String
    priceBySize: Boolean
    productStory: String
    program: String
    referenceOptionNumber: String
    referenceStyleNumber: String
    rise: String
    salesChannels: [String]
    salesComments: String
    salesOrganizationCode: String
    seasonYear: String
    shape: String
    sizeCode: String
    sizeRange: String
    sizeRangeOption: String
    sleeveLength: String
    styleDescription: String
    styleDescriptions: [String]
    styleNumber: String
    styleSeasonCode: String
    sustainableAttribute: String
    sustainableFiber: String
    sustainableFibers: [String]
    swatchBookNumber: String
    theme: Theme
    wash: String
  }

  type ImageDetails {
    imageKey: String!
    backModifiedOn: String
    backUrl: String
    back2ModifiedOn: String
    back2Url: String
    back3ModifiedOn: String
    back3Url: String
    detailModifiedOn: String
    detailUrl: String
    detail2ModifiedOn: String
    detail2Url: String
    detail3ModifiedOn: String
    detail3Url: String
    fabricScanModifiedOn: String
    fabricScanUrl: String
    frontModifiedOn: String
    frontUrl: String
    front2ModifiedOn: String
    front2Url: String
    front3ModifiedOn: String
    front3Url: String
    i360ModifiedOn: String
    i360Url: String
    imageModifiedOn: String
    imageUrl: String
    insideModifiedOn: String
    insideUrl: String
    inside2ModifiedOn: String
    inside2Url: String
    inside3ModifiedOn: String
    inside3Url: String
    gridModifiedOn: String
    gridUrl: String
    packageModifiedOn: String
    packageUrl: String
    sketchModifiedOn: String
    sketchUrl: String
  }

  type LookDetails {
    assetUrl: String
    brand: String
    channels: [String]
    createdOn: String
    createdOnSourceSystem: String
    deliveryName: String
    description: String
    divisionCode: String
    documentUpdatedBy: String
    gender: String
    isDeleted: Boolean
    lookId: String
    lookType: Int
    modifiedOn: String
    modifiedOnSourceSystem: String
    nuxeoId: String
    position: Int
    processedOn: String
    relatedStyles: [String]
    sourceSystem: String
    styleSeasonCodeAfs: String
    tag: String
    title: String
    trend: String
  }

  type UrlSuffixesResult {
    divisionCode: String!
    urls: [String!]!
  }

  scalar JSON

  input BucketScopeCollection {
    bucket: String!
    scope: String!
    collection: String!
  }

  type DocumentResult {
    bucket: String!
    scope: String!
    collection: String!
    data: JSON
    timeTaken: Float!
  }

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

  type SeasonalDivisionalAssignment {
    channels: [String!]!
    division: Division
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

  type Division {
    name: String!
    code: String!
    isActive: Boolean!
  }

  type FMSSeason {
    code: String!
    name: String!
  }

  type FMS {
    season: [FMSSeason!]!
    year: String!
  }

  type Query {
    looksSummary(brand: String, season: String, division: String): LookSummary
    looks(brand: String, season: String, division: String): [Look]
    optionsSummary(
      SalesOrganizationCode: String!
      StyleSeasonCode: String!
      DivisionCode: String!
      ActiveOption: Boolean!
      SalesChannels: [SalesChannel!]!
    ): OptionSummary!
    optionsProductView(
      BrandCode: String!
      SalesOrganizationCode: String!
      StyleSeasonCode: String!
      DivisionCode: String!
      ActiveOption: Boolean!
      SalesChannels: [SalesChannel!]!
    ): [OptionProductView]
    imageDetails(
      divisionCode: String!
      styleSeasonCode: String!
      styleCode: String!
    ): ImageDetails
    lookDetails(lookDocKey: String!): LookDetails
    getImageUrlCheck(
      divisions: [String!]!
      season: String!
    ): [UrlSuffixesResult!]!
    getLooksUrlCheck(
      divisions: [String!]!
      season: String!
    ): [UrlSuffixesResult!]!
    searchDocuments(
      collections: [BucketScopeCollection!]!
      keys: [String!]!
    ): [DocumentResult!]!
    getAllSeasonalAssignments(
      styleSeasonCode: String!
      companyCode: String
      isActive: Boolean
    ): [SeasonalAssignment!]!
    #        getSeasonalAssignment(styleSeasonCode: String!, companyCode: String!, isActive: Boolean): SeasonalAssignment
    getDivisionAssignment(
      styleSeasonCode: String!
      companyCode: String!
      divisionCode: String!
    ): SeasonalDivisionalAssignment
  }
`;

export default typeDefs;
