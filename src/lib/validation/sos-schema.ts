import { z } from "zod";
import { locationSchema } from "./location-schema";
import { readingPayloadSchema } from "./reading-schema";
import { trekkerId } from "./shared-schema";
import { symptoms } from "./symptom-schema";

export const sosSources = [
  "physical_button",
  "web_button",
  "manual",
  "demo",
] as const;

export const sosSchema = z
  .object({
    trekkerId,
    deviceId: z.string().trim().min(1).max(100).optional(),
    source: z.enum(sosSources),
    symptom: z.enum(symptoms).optional(),
    reading: readingPayloadSchema.optional(),
    location: locationSchema
      .omit({ trekkerId: true, source: true })
      .optional(),
  })
  .strict();

export const updateSosStatusSchema = z
  .object({
    status: z.enum(["new", "acknowledged", "in_progress", "resolved", "cancelled"]),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();
