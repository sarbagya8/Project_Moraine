import { z } from "zod";
import { trekkerId } from "./shared-schema";

export const symptoms = [
  "Headache",
  "Dizziness",
  "Nausea",
  "Breathing difficulty",
  "Extreme tiredness",
  "Chest discomfort",
  "Injury",
  "Other",
  "No symptoms",
] as const;

export const symptomSeverities = [
  "mild",
  "moderate",
  "severe",
  "unspecified",
] as const;

export const symptomSchema = z
  .object({
    trekkerId,
    symptom: z.enum(symptoms),
    severity: z.enum(symptomSeverities).default("unspecified"),
    notes: z.string().trim().max(500).optional().default(""),
  })
  .strict();
