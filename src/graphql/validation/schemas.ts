/* src/graphql/validation/schemas.ts */

import { GraphQLError } from "graphql";
import { z } from "zod";

// Schema for looks query - all parameters are optional strings
export const LooksArgsSchema = z
  .object({
    brand: z.string().optional(),
    season: z.string().optional(),
    division: z.string().optional(),
  })
  .strict();

export type LooksArgs = z.infer<typeof LooksArgsSchema>;

// Schema for looksSummary query - same as looks
export const LooksSummaryArgsSchema = z
  .object({
    brand: z.string().optional(),
    season: z.string().optional(),
    division: z.string().optional(),
  })
  .strict();

export type LooksSummaryArgs = z.infer<typeof LooksSummaryArgsSchema>;

// Sales channel enum matching GraphQL
export const SalesChannelSchema = z.enum(["SELLIN", "B2B"]);

// Schema for optionsSummary query - all parameters are required
export const OptionsSummaryArgsSchema = z
  .object({
    SalesOrganizationCode: z.string().min(1),
    StyleSeasonCode: z.string().min(1),
    DivisionCode: z.string().min(1),
    ActiveOption: z.boolean(),
    SalesChannels: z.array(SalesChannelSchema).min(1),
  })
  .strict();

export type OptionsSummaryArgs = z.infer<typeof OptionsSummaryArgsSchema>;

// Schema for optionsProductView query - all parameters are required
export const OptionsProductViewArgsSchema = z
  .object({
    BrandCode: z.string().min(1),
    SalesOrganizationCode: z.string().min(1),
    StyleSeasonCode: z.string().min(1),
    DivisionCode: z.string().min(1),
    ActiveOption: z.boolean(),
    SalesChannels: z.array(SalesChannelSchema).min(1),
  })
  .strict();

export type OptionsProductViewArgs = z.infer<typeof OptionsProductViewArgsSchema>;

// Schema for imageDetails query - all parameters are required
export const ImageDetailsArgsSchema = z
  .object({
    divisionCode: z.string().min(1),
    styleSeasonCode: z.string().min(1),
    styleCode: z.string().min(1),
  })
  .strict();

export type ImageDetailsArgs = z.infer<typeof ImageDetailsArgsSchema>;

// Schema for lookDetails query - lookDocKey is required
export const LookDetailsArgsSchema = z
  .object({
    lookDocKey: z.string().min(1),
  })
  .strict();

export type LookDetailsArgs = z.infer<typeof LookDetailsArgsSchema>;

// Schema for documentSearch query
export const BucketScopeCollectionSchema = z
  .object({
    bucket: z.string().min(1),
    scope: z.string().min(1),
    collection: z.string().min(1),
  })
  .strict();

export const DocumentSearchArgsSchema = z
  .object({
    collections: z.array(BucketScopeCollectionSchema).min(1),
    keys: z.array(z.string()).min(1),
  })
  .strict();

export type DocumentSearchArgs = z.infer<typeof DocumentSearchArgsSchema>;

// Schema for getImageUrlCheck query
export const ImageUrlCheckArgsSchema = z
  .object({
    divisions: z.array(z.string().min(1)).min(1),
    season: z.string().min(1),
  })
  .strict();

export type ImageUrlCheckArgs = z.infer<typeof ImageUrlCheckArgsSchema>;

// Schema for getLooksUrlCheck query
export const LooksUrlCheckArgsSchema = z
  .object({
    divisions: z.array(z.string().min(1)).min(1),
    season: z.string().min(1),
  })
  .strict();

export type LooksUrlCheckArgs = z.infer<typeof LooksUrlCheckArgsSchema>;

// Schema for getAllSeasonalAssignments query
export const GetAllSeasonalAssignmentsArgsSchema = z
  .object({
    styleSeasonCode: z.string().min(1),
    companyCode: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type GetAllSeasonalAssignmentsArgs = z.infer<typeof GetAllSeasonalAssignmentsArgsSchema>;

// Schema for getDivisionAssignment query
export const GetDivisionAssignmentArgsSchema = z
  .object({
    styleSeasonCode: z.string().min(1),
    companyCode: z.string().min(1),
    divisionCode: z.string().min(1),
  })
  .strict();

export type GetDivisionAssignmentArgs = z.infer<typeof GetDivisionAssignmentArgsSchema>;

/**
 * Higher-order function to add validation to GraphQL resolvers
 */
export function withValidation<TArgs, TResult>(
  schema: z.ZodSchema<TArgs>,
  resolver: (_: unknown, args: TArgs, context: any) => Promise<TResult> | TResult
) {
  return async (_: unknown, args: unknown, context: any): Promise<TResult> => {
    try {
      // Validate and parse arguments
      const validatedArgs = schema.parse(args);

      // Call the original resolver with validated arguments
      return await resolver(_, validatedArgs, context);
    } catch (error) {
      // Zod v4 uses .issues instead of .errors
      if (error instanceof z.ZodError) {
        // Transform Zod validation errors into GraphQL errors
        // Use GraphQLError with BAD_USER_INPUT code to avoid stack trace logging
        const issues = error.issues ?? [];
        const validationErrors = issues.map((err) => `${err.path.join(".")}: ${err.message}`).join(", ");

        throw new GraphQLError(`Input validation failed: ${validationErrors}`, {
          extensions: {
            code: "BAD_USER_INPUT",
            validationErrors: issues.map((err) => ({
              path: err.path,
              message: err.message,
            })),
          },
        });
      }

      // Re-throw non-validation errors
      throw error;
    }
  };
}
