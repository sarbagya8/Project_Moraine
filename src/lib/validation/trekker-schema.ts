import { z } from "zod";
import {
  optionalNepalPhone,
  optionalTrimmedText,
  trekkerId,
  trimmedText,
} from "./shared-schema";

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export const createTrekkerSchema = z
  .object({
    id: trekkerId,
    name: trimmedText(120),
    mobileNumber: optionalNepalPhone,
    emergencyContact: z
      .string()
      .trim()
      .regex(/^(?:\+?977)?9[678][0-9]{8}$/, "Use a valid Nepal mobile number."),
    guideMobile: optionalNepalPhone,
    routeName: optionalTrimmedText(160),
    bloodGroup: z.enum(bloodGroups).optional(),
    medicalNotes: optionalTrimmedText(1_000),
  })
  .strict();

export const updateTrekkerSchema = createTrekkerSchema
  .omit({ id: true })
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .strict()
  .refine((input) => Object.keys(input).length > 0, "At least one field is required.");
