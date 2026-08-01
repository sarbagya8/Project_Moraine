import { z } from "zod";
import { isoDate, trekkerId } from "./shared-schema";

export const locationSources = ["browser", "device", "manual", "demo"] as const;

export const locationSchema = z
  .object({
    trekkerId,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().min(0).max(100_000).optional(),
    altitude: z.number().min(-500).max(9_000).optional(),
    source: z.enum(locationSources),
    capturedAt: isoDate,
  })
  .strict();
