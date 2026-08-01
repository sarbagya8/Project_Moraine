import { z } from "zod";
import { locationSchema } from "./location-schema";
import { readingSchema } from "./reading-schema";
import { isoDate, trekkerId } from "./shared-schema";

const deviceId = z.string().trim().min(1).max(100);
const eventId = z
  .string()
  .trim()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9._:-]+$/);
const bridgeSensorSchema = readingSchema.omit({ trekkerId: true });

export const bridgeIdentitySchema = z.object({
  deviceId,
  trekkerId,
  firmwareVersion: z.string().trim().min(1).max(40),
}).strict();

export const bridgeReadingSchema = readingSchema;

export const bridgeLocationSchema = locationSchema
  .omit({ source: true })
  .extend({ deviceId });

export const bridgeSosSchema = z
  .object({
    eventId,
    deviceId,
    trekkerId,
    pressedAt: isoDate.optional(),
    source: z.literal("physical_button").optional(),
    reading: bridgeSensorSchema.optional(),
    location: locationSchema
      .omit({ trekkerId: true, source: true })
      .optional(),
  })
  .strict();
