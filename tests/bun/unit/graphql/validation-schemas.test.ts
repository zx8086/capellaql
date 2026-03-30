/* tests/bun/unit/graphql/validation-schemas.test.ts */

import { describe, expect, test } from "bun:test";
import { GraphQLError } from "graphql";
import { z } from "zod";
import {
  BucketScopeCollectionSchema,
  DocumentSearchArgsSchema,
  GetAllSeasonalAssignmentsArgsSchema,
  GetDivisionAssignmentArgsSchema,
  ImageDetailsArgsSchema,
  ImageUrlCheckArgsSchema,
  LookDetailsArgsSchema,
  LooksArgsSchema,
  LooksSummaryArgsSchema,
  LooksUrlCheckArgsSchema,
  OptionsProductViewArgsSchema,
  OptionsSummaryArgsSchema,
  SalesChannelSchema,
  withValidation,
} from "../../../../src/graphql/validation/schemas";

describe("GraphQL Validation Schemas", () => {
  describe("LooksArgsSchema", () => {
    test("accepts valid input with all fields", () => {
      const input = { brand: "TH", season: "SS25", division: "Menswear" };
      const result = LooksArgsSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });

    test("accepts valid input with no fields (all optional)", () => {
      const result = LooksArgsSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({});
      }
    });

    test("accepts valid input with partial fields", () => {
      const result = LooksArgsSchema.safeParse({ brand: "TH" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ brand: "TH" });
      }
    });

    test("rejects extra fields due to strict mode", () => {
      const result = LooksArgsSchema.safeParse({
        brand: "TH",
        unknownField: "should fail",
      });
      expect(result.success).toBe(false);
    });

    test("rejects non-string values for brand", () => {
      const result = LooksArgsSchema.safeParse({ brand: 123 });
      expect(result.success).toBe(false);
    });

    test("rejects non-string values for season", () => {
      const result = LooksArgsSchema.safeParse({ season: true });
      expect(result.success).toBe(false);
    });
  });

  describe("LooksSummaryArgsSchema", () => {
    test("accepts valid input with all fields", () => {
      const input = { brand: "CK", season: "FW25", division: "Womenswear" };
      const result = LooksSummaryArgsSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });

    test("accepts valid input with no fields (all optional)", () => {
      const result = LooksSummaryArgsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test("accepts valid input with partial fields", () => {
      const result = LooksSummaryArgsSchema.safeParse({ season: "SS26" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ season: "SS26" });
      }
    });

    test("rejects extra fields due to strict mode", () => {
      const result = LooksSummaryArgsSchema.safeParse({
        brand: "TH",
        extraProp: "nope",
      });
      expect(result.success).toBe(false);
    });

    test("rejects non-string values for division", () => {
      const result = LooksSummaryArgsSchema.safeParse({ division: 42 });
      expect(result.success).toBe(false);
    });
  });

  describe("SalesChannelSchema", () => {
    test("accepts SELLIN", () => {
      const result = SalesChannelSchema.safeParse("SELLIN");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("SELLIN");
      }
    });

    test("accepts B2B", () => {
      const result = SalesChannelSchema.safeParse("B2B");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("B2B");
      }
    });

    test("rejects other strings", () => {
      const result = SalesChannelSchema.safeParse("RETAIL");
      expect(result.success).toBe(false);
    });

    test("rejects lowercase variants", () => {
      const result = SalesChannelSchema.safeParse("sellin");
      expect(result.success).toBe(false);
    });

    test("rejects numbers", () => {
      const result = SalesChannelSchema.safeParse(1);
      expect(result.success).toBe(false);
    });
  });

  describe("OptionsSummaryArgsSchema", () => {
    const validInput = {
      SalesOrganizationCode: "US01",
      StyleSeasonCode: "SS25",
      DivisionCode: "MW",
      ActiveOption: true,
      SalesChannels: ["SELLIN"],
    };

    test("accepts valid complete input", () => {
      const result = OptionsSummaryArgsSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validInput);
      }
    });

    test("accepts multiple SalesChannels", () => {
      const input = { ...validInput, SalesChannels: ["SELLIN", "B2B"] };
      const result = OptionsSummaryArgsSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    test("rejects empty string for SalesOrganizationCode", () => {
      const result = OptionsSummaryArgsSchema.safeParse({
        ...validInput,
        SalesOrganizationCode: "",
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty string for StyleSeasonCode", () => {
      const result = OptionsSummaryArgsSchema.safeParse({
        ...validInput,
        StyleSeasonCode: "",
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty string for DivisionCode", () => {
      const result = OptionsSummaryArgsSchema.safeParse({
        ...validInput,
        DivisionCode: "",
      });
      expect(result.success).toBe(false);
    });

    test("rejects missing required fields", () => {
      const result = OptionsSummaryArgsSchema.safeParse({
        SalesOrganizationCode: "US01",
      });
      expect(result.success).toBe(false);
    });

    test("rejects wrong type for ActiveOption", () => {
      const result = OptionsSummaryArgsSchema.safeParse({
        ...validInput,
        ActiveOption: "yes",
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty SalesChannels array", () => {
      const result = OptionsSummaryArgsSchema.safeParse({
        ...validInput,
        SalesChannels: [],
      });
      expect(result.success).toBe(false);
    });

    test("rejects invalid SalesChannel values in array", () => {
      const result = OptionsSummaryArgsSchema.safeParse({
        ...validInput,
        SalesChannels: ["INVALID"],
      });
      expect(result.success).toBe(false);
    });

    test("rejects extra fields due to strict mode", () => {
      const result = OptionsSummaryArgsSchema.safeParse({
        ...validInput,
        ExtraField: "not allowed",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("OptionsProductViewArgsSchema", () => {
    const validInput = {
      BrandCode: "TH",
      SalesOrganizationCode: "US01",
      StyleSeasonCode: "SS25",
      DivisionCode: "MW",
      ActiveOption: false,
      SalesChannels: ["B2B"],
    };

    test("accepts valid input", () => {
      const result = OptionsProductViewArgsSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validInput);
      }
    });

    test("rejects missing BrandCode", () => {
      const { BrandCode: _, ...withoutBrand } = validInput;
      const result = OptionsProductViewArgsSchema.safeParse(withoutBrand);
      expect(result.success).toBe(false);
    });

    test("rejects empty string for BrandCode", () => {
      const result = OptionsProductViewArgsSchema.safeParse({
        ...validInput,
        BrandCode: "",
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty string for SalesOrganizationCode", () => {
      const result = OptionsProductViewArgsSchema.safeParse({
        ...validInput,
        SalesOrganizationCode: "",
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty SalesChannels array", () => {
      const result = OptionsProductViewArgsSchema.safeParse({
        ...validInput,
        SalesChannels: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ImageDetailsArgsSchema", () => {
    const validInput = {
      divisionCode: "MW",
      styleSeasonCode: "SS25",
      styleCode: "WW0WW12345",
    };

    test("accepts valid input", () => {
      const result = ImageDetailsArgsSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validInput);
      }
    });

    test("rejects empty string for divisionCode", () => {
      const result = ImageDetailsArgsSchema.safeParse({
        ...validInput,
        divisionCode: "",
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty string for styleSeasonCode", () => {
      const result = ImageDetailsArgsSchema.safeParse({
        ...validInput,
        styleSeasonCode: "",
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty string for styleCode", () => {
      const result = ImageDetailsArgsSchema.safeParse({
        ...validInput,
        styleCode: "",
      });
      expect(result.success).toBe(false);
    });

    test("rejects missing required fields", () => {
      const result = ImageDetailsArgsSchema.safeParse({
        divisionCode: "MW",
      });
      expect(result.success).toBe(false);
    });

    test("rejects extra fields due to strict mode", () => {
      const result = ImageDetailsArgsSchema.safeParse({
        ...validInput,
        extra: "not allowed",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("LookDetailsArgsSchema", () => {
    test("accepts valid input", () => {
      const result = LookDetailsArgsSchema.safeParse({
        lookDocKey: "look::123",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ lookDocKey: "look::123" });
      }
    });

    test("rejects empty lookDocKey", () => {
      const result = LookDetailsArgsSchema.safeParse({ lookDocKey: "" });
      expect(result.success).toBe(false);
    });

    test("rejects missing lookDocKey", () => {
      const result = LookDetailsArgsSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test("rejects extra fields due to strict mode", () => {
      const result = LookDetailsArgsSchema.safeParse({
        lookDocKey: "look::123",
        extra: true,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("BucketScopeCollectionSchema", () => {
    const validInput = {
      bucket: "product-data",
      scope: "catalog",
      collection: "styles",
    };

    test("accepts valid input", () => {
      const result = BucketScopeCollectionSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validInput);
      }
    });

    test("rejects empty bucket", () => {
      const result = BucketScopeCollectionSchema.safeParse({
        ...validInput,
        bucket: "",
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty scope", () => {
      const result = BucketScopeCollectionSchema.safeParse({
        ...validInput,
        scope: "",
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty collection", () => {
      const result = BucketScopeCollectionSchema.safeParse({
        ...validInput,
        collection: "",
      });
      expect(result.success).toBe(false);
    });

    test("rejects extra fields due to strict mode", () => {
      const result = BucketScopeCollectionSchema.safeParse({
        ...validInput,
        extra: "field",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("DocumentSearchArgsSchema", () => {
    const validCollection = {
      bucket: "product-data",
      scope: "catalog",
      collection: "styles",
    };

    const validInput = {
      collections: [validCollection],
      keys: ["doc::1", "doc::2"],
    };

    test("accepts valid input", () => {
      const result = DocumentSearchArgsSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validInput);
      }
    });

    test("accepts multiple collections", () => {
      const input = {
        collections: [
          validCollection,
          { bucket: "another", scope: "sc", collection: "col" },
        ],
        keys: ["key1"],
      };
      const result = DocumentSearchArgsSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    test("rejects empty collections array", () => {
      const result = DocumentSearchArgsSchema.safeParse({
        collections: [],
        keys: ["doc::1"],
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty keys array", () => {
      const result = DocumentSearchArgsSchema.safeParse({
        collections: [validCollection],
        keys: [],
      });
      expect(result.success).toBe(false);
    });

    test("rejects invalid collection objects (missing fields)", () => {
      const result = DocumentSearchArgsSchema.safeParse({
        collections: [{ bucket: "only-bucket" }],
        keys: ["doc::1"],
      });
      expect(result.success).toBe(false);
    });

    test("rejects invalid collection objects (empty strings)", () => {
      const result = DocumentSearchArgsSchema.safeParse({
        collections: [{ bucket: "", scope: "", collection: "" }],
        keys: ["doc::1"],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ImageUrlCheckArgsSchema", () => {
    const validInput = { divisions: ["MW", "WW"], season: "SS25" };

    test("accepts valid input", () => {
      const result = ImageUrlCheckArgsSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validInput);
      }
    });

    test("rejects empty divisions array", () => {
      const result = ImageUrlCheckArgsSchema.safeParse({
        divisions: [],
        season: "SS25",
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty strings in divisions array", () => {
      const result = ImageUrlCheckArgsSchema.safeParse({
        divisions: [""],
        season: "SS25",
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty season", () => {
      const result = ImageUrlCheckArgsSchema.safeParse({
        divisions: ["MW"],
        season: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("LooksUrlCheckArgsSchema", () => {
    const validInput = { divisions: ["MW"], season: "FW25" };

    test("accepts valid input", () => {
      const result = LooksUrlCheckArgsSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validInput);
      }
    });

    test("rejects empty divisions array", () => {
      const result = LooksUrlCheckArgsSchema.safeParse({
        divisions: [],
        season: "FW25",
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty strings in divisions array", () => {
      const result = LooksUrlCheckArgsSchema.safeParse({
        divisions: ["MW", ""],
        season: "FW25",
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty season", () => {
      const result = LooksUrlCheckArgsSchema.safeParse({
        divisions: ["MW"],
        season: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("GetAllSeasonalAssignmentsArgsSchema", () => {
    test("accepts valid input with required fields only", () => {
      const result = GetAllSeasonalAssignmentsArgsSchema.safeParse({
        styleSeasonCode: "SS25",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ styleSeasonCode: "SS25" });
      }
    });

    test("accepts valid input with all optional fields", () => {
      const input = {
        styleSeasonCode: "SS25",
        companyCode: "PVH",
        isActive: true,
      };
      const result = GetAllSeasonalAssignmentsArgsSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });

    test("accepts isActive as false", () => {
      const result = GetAllSeasonalAssignmentsArgsSchema.safeParse({
        styleSeasonCode: "FW25",
        isActive: false,
      });
      expect(result.success).toBe(true);
    });

    test("rejects empty styleSeasonCode", () => {
      const result = GetAllSeasonalAssignmentsArgsSchema.safeParse({
        styleSeasonCode: "",
      });
      expect(result.success).toBe(false);
    });

    test("rejects extra fields due to strict mode", () => {
      const result = GetAllSeasonalAssignmentsArgsSchema.safeParse({
        styleSeasonCode: "SS25",
        unknownField: "nope",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("GetDivisionAssignmentArgsSchema", () => {
    const validInput = {
      styleSeasonCode: "SS25",
      companyCode: "PVH",
      divisionCode: "MW",
    };

    test("accepts valid input", () => {
      const result = GetDivisionAssignmentArgsSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validInput);
      }
    });

    test("rejects empty styleSeasonCode", () => {
      const result = GetDivisionAssignmentArgsSchema.safeParse({
        ...validInput,
        styleSeasonCode: "",
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty companyCode", () => {
      const result = GetDivisionAssignmentArgsSchema.safeParse({
        ...validInput,
        companyCode: "",
      });
      expect(result.success).toBe(false);
    });

    test("rejects empty divisionCode", () => {
      const result = GetDivisionAssignmentArgsSchema.safeParse({
        ...validInput,
        divisionCode: "",
      });
      expect(result.success).toBe(false);
    });

    test("rejects missing required fields", () => {
      const result = GetDivisionAssignmentArgsSchema.safeParse({
        styleSeasonCode: "SS25",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("withValidation", () => {
    const testSchema = z.object({
      name: z.string().min(1),
      count: z.number().positive(),
    });

    test("passes validated args to resolver", async () => {
      let receivedArgs: unknown = null;
      const resolver = (_: unknown, args: { name: string; count: number }) => {
        receivedArgs = args;
        return "ok";
      };

      const wrapped = withValidation(testSchema, resolver);
      await wrapped(null, { name: "test", count: 5 }, {});

      expect(receivedArgs).toEqual({ name: "test", count: 5 });
    });

    test("returns resolver result", async () => {
      const resolver = (_: unknown, args: { name: string; count: number }) => {
        return { result: args.name, total: args.count };
      };

      const wrapped = withValidation(testSchema, resolver);
      const result = await wrapped(null, { name: "item", count: 3 }, {});

      expect(result).toEqual({ result: "item", total: 3 });
    });

    test("transforms ZodError into GraphQLError with BAD_USER_INPUT code", async () => {
      const resolver = (_: unknown, args: { name: string; count: number }) => args;
      const wrapped = withValidation(testSchema, resolver);

      try {
        await wrapped(null, { name: "", count: -1 }, {});
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(GraphQLError);
        const gqlError = error as GraphQLError;
        expect(gqlError.extensions.code).toBe("BAD_USER_INPUT");
        expect(gqlError.message).toContain("Input validation failed");
      }
    });

    test("includes validationErrors in extensions with path and message", async () => {
      const resolver = (_: unknown, args: { name: string; count: number }) => args;
      const wrapped = withValidation(testSchema, resolver);

      try {
        await wrapped(null, { name: "", count: -1 }, {});
        expect(true).toBe(false);
      } catch (error) {
        const gqlError = error as GraphQLError;
        const validationErrors = gqlError.extensions.validationErrors as Array<{
          path: Array<string | number>;
          message: string;
        }>;

        expect(Array.isArray(validationErrors)).toBe(true);
        expect(validationErrors.length).toBeGreaterThan(0);

        for (const entry of validationErrors) {
          expect(entry).toHaveProperty("path");
          expect(entry).toHaveProperty("message");
          expect(Array.isArray(entry.path)).toBe(true);
          expect(typeof entry.message).toBe("string");
        }
      }
    });

    test("re-throws non-validation errors unchanged", async () => {
      const customError = new Error("database connection failed");
      const resolver = () => {
        throw customError;
      };

      const wrapped = withValidation(testSchema, resolver);

      try {
        await wrapped(null, { name: "valid", count: 1 }, {});
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBe(customError);
        expect(error).not.toBeInstanceOf(GraphQLError);
      }
    });

    test("works with async resolvers", async () => {
      const resolver = async (_: unknown, args: { name: string; count: number }) => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 1));
        return `async-${args.name}`;
      };

      const wrapped = withValidation(testSchema, resolver);
      const result = await wrapped(null, { name: "test", count: 1 }, {});

      expect(result).toBe("async-test");
    });

    test("works with sync resolvers", async () => {
      const resolver = (_: unknown, args: { name: string; count: number }) => {
        return `sync-${args.name}`;
      };

      const wrapped = withValidation(testSchema, resolver);
      const result = await wrapped(null, { name: "hello", count: 2 }, {});

      expect(result).toBe("sync-hello");
    });

    test("passes context through to resolver", async () => {
      let receivedContext: unknown = null;
      const resolver = (_: unknown, _args: { name: string; count: number }, ctx: unknown) => {
        receivedContext = ctx;
        return "ok";
      };

      const mockContext = { userId: "user-123", role: "admin" };
      const wrapped = withValidation(testSchema, resolver);
      await wrapped(null, { name: "test", count: 1 }, mockContext);

      expect(receivedContext).toEqual(mockContext);
    });

    test("error message includes field path information", async () => {
      const resolver = (_: unknown, args: { name: string; count: number }) => args;
      const wrapped = withValidation(testSchema, resolver);

      try {
        await wrapped(null, { name: "valid", count: -5 }, {});
        expect(true).toBe(false);
      } catch (error) {
        const gqlError = error as GraphQLError;
        expect(gqlError.message).toContain("count");
      }
    });

    test("rejects completely invalid input (wrong type)", async () => {
      const resolver = (_: unknown, args: { name: string; count: number }) => args;
      const wrapped = withValidation(testSchema, resolver);

      try {
        await wrapped(null, "not an object", {});
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(GraphQLError);
        const gqlError = error as GraphQLError;
        expect(gqlError.extensions.code).toBe("BAD_USER_INPUT");
      }
    });
  });
});
