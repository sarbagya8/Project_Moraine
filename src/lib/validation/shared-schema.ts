import { z } from "zod";

const FIVE_MINUTES_MS = 5 * 60 * 1_000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;

export const trekkerId = z
  .string()
  .trim()
  .min(1, "trekkerId is required.")
  .max(64, "trekkerId is too long.")
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "trekkerId may contain only letters, numbers, underscores, and hyphens.",
  );

export const isoDate = z
  .string()
  .datetime({ offset: true, message: "capturedAt must be an ISO timestamp with timezone." })
  .refine((value) => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp <= Date.now() + FIVE_MINUTES_MS;
  }, "capturedAt cannot be more than five minutes in the future.")
  .refine((value) => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp >= Date.now() - THIRTY_DAYS_MS;
  }, "capturedAt is too old.");

export const trimmedText = (max: number) =>
  z.string().trim().min(1, "This field cannot be empty.").max(max);

export const optionalTrimmedText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const nepalPhone = z
  .string()
  .trim()
  .regex(
    /^(?:\+?977)?9[678][0-9]{8}$/,
    "Use a valid Nepal mobile number.",
  );

export const optionalNepalPhone = z
  .union([nepalPhone, z.literal(""), z.null()])
  .optional()
  .transform((value) => (value ? value : null));
