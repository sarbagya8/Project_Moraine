import { z } from "zod";
import {
  ARGUS_SENSOR_STATES,
  type ArgusSensorState,
} from "../bluetooth/argus-ble-config";
import { isoDate, trekkerId } from "./shared-schema";

export const sensorStateSchema = z.enum(ARGUS_SENSOR_STATES);

const readingFields = {
  deviceId: z.string().trim().min(1).max(100),
  heartRate: z.number().int().min(20).max(240).nullable(),
  spo2: z.number().min(50).max(100).nullable(),
  altitude: z.number().min(-500).max(9_000).nullable().optional(),
  temperature: z.number().min(-50).max(80).nullable(),
  temperatureType: z.literal("ambient").nullable().optional(),
  sensorState: sensorStateSchema.default("valid"),
  deviceCapturedAtMs: z.number().int().min(0).max(0xFFFFFFFF).optional(),
  capturedAt: isoDate,
  pressure: z.number().min(100).max(1_200).nullable().optional(),
  startAltitude: z.number().min(-500).max(9_000).nullable().optional(),
  currentAltitude: z.number().min(-500).max(9_000).nullable().optional(),
  averageSpeed: z.number().min(0).max(100).nullable().optional(),
  distance: z.number().min(0).max(10_000_000).nullable().optional(),
  amsStatus: z.string().trim().max(80).nullable().optional(),
  fallDetected: z.boolean().optional(),
  fallType: z.string().trim().max(80).nullable().optional(),
  sosCountdown: z.boolean().optional(),
  sosActive: z.boolean().optional(),
};

function validateReading(
  reading: {
    heartRate: number | null;
    spo2: number | null;
    temperature: number | null;
    temperatureType?: "ambient" | null;
    sensorState: ArgusSensorState;
  },
  context: z.RefinementCtx,
) {
    const state = reading.sensorState as ArgusSensorState;
    if (state === "valid" && (reading.heartRate === null || reading.spo2 === null)) {
      context.addIssue({
        code: "custom",
        message: "Valid readings require heart rate and SpO2.",
      });
    }
    if (state !== "valid" && (reading.heartRate !== null || reading.spo2 !== null)) {
      context.addIssue({
        code: "custom",
        message: "Unavailable readings must use null heart rate and SpO2.",
      });
    }
    if (reading.temperature !== null && reading.temperatureType !== "ambient") {
      context.addIssue({
        code: "custom",
        message: "A temperature value must be identified as ambient.",
      });
    }
}

export const readingPayloadSchema = z
  .object(readingFields)
  .strict()
  .superRefine(validateReading);

export const readingSchema = z
  .object({ ...readingFields, trekkerId })
  .strict()
  .superRefine(validateReading);
