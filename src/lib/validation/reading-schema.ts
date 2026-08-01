import { z } from "zod";
import { isoDate, trekkerId } from "./shared-schema";

export const readingSchema = z
  .object({
    trekkerId,
    deviceId: z.string().trim().min(1).max(100),
    heartRate: z.number().int().min(20).max(240),
    spo2: z.number().min(50).max(100),
    altitude: z.number().min(-500).max(9_000).nullable().optional(),
    temperature: z.number().min(-50).max(80).nullable(),
    capturedAt: isoDate,
  })
  .strict();
