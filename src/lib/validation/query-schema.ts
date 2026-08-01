import { z } from "zod";
import { trekkerId } from "./shared-schema";

export const latestQuerySchema = z.object({ trekkerId }).strict();

export const rescueListQuerySchema = z
  .object({
    status: z.enum(["active", "acknowledged", "resolved"]).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const uuidSchema = z.string().uuid("A valid SOS event ID is required.");
