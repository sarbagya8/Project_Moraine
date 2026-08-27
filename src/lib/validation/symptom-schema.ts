import { z } from "zod";
import { trekkerId } from "./shared-schema";

export const symptoms = [
  "Headache",
  "Dizziness",
  "Nausea",
  "Breathing difficulty",
  "Shortness of breath",
  "Extreme tiredness",
  "Weakness",
  "Chest discomfort",
  "Injury",
  "Other",
  "No symptoms",
  "Fever or feeling hot",
  "Fever or feeling feverish",
  "Abdominal pain",
  "Diarrhea",
  "Cough",
  "Other health concern",
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
    duration: z.string().trim().max(100).optional().default(""),
  })
  .strict();
