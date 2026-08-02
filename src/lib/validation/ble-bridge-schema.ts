import { z } from "zod";
import { isoDate, trekkerId } from "./shared-schema";
import { readingPayloadSchema } from "./reading-schema";

const deviceId = z.string().trim().min(1).max(100);
const eventId = z
  .string()
  .trim()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const bridgeIdentitySchema = z
  .object({
    deviceId,
    trekkerId: trekkerId.nullable().optional(),
    firmwareVersion: z.string().trim().min(1).max(40).nullable().optional(),
    deviceName: z.string().trim().min(1).max(80).optional(),
    identitySource: z.enum(["firmware", "assigned_device"]),
  })
  .strict();

export const bridgeReadingSchema = readingPayloadSchema;

export const bridgeLocationSchema = z
  .object({
    deviceId,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().min(0).max(100_000).optional(),
    altitude: z.number().min(-500).max(9_000).optional(),
    capturedAt: isoDate,
  })
  .strict();

export const bridgeSosSchema = z
  .object({
    eventId,
    deviceId,
    trekkerId: trekkerId.nullable().optional(),
    pressedAt: isoDate.optional(),
    devicePressedAtMs: z.number().int().min(0).max(0xFFFFFFFF).optional(),
    source: z.literal("physical_button"),
    reading: readingPayloadSchema.optional(),
    location: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        accuracyMeters: z.number().min(0).max(100_000).optional(),
        altitude: z.number().min(-500).max(9_000).optional(),
        capturedAt: isoDate,
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
