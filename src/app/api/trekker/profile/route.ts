import { z } from "zod";
import { failure, readJson, success, validationFailure } from "@/lib/api-response";
import { databaseError, zodDetails, zodMessage } from "@/lib/api-route-support";
import { isHealthProfileMigrationError, withHealthProfileSchemaFallback } from "@/lib/database-schema";
import { requestSession } from "@/lib/portal-auth";
import { withRequestContext } from "@/lib/request-context";
import { getSupabaseServer } from "@/lib/supabase/server";

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"] as const;
const nullableText = (limit: number) => z.string().trim().max(limit).nullable().optional();
const profileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  dateOfBirth: z.string().date().nullable().optional(),
  mobileNumber: nullableText(40),
  address: nullableText(300),
  bloodGroup: z.enum(bloodGroups).nullable().optional(),
  emergencyContactName: nullableText(120),
  emergencyContactPhone: nullableText(40),
  emergencyContactRelationship: nullableText(80),
  secondaryEmergencyContactName: nullableText(120),
  secondaryEmergencyContactPhone: nullableText(40),
  preferredLanguage: nullableText(80),
  allergies: nullableText(1000),
  knownConditions: nullableText(1000),
  currentMedications: nullableText(1000),
  healthNotes: nullableText(1000),
  emergencyNotes: nullableText(1000),
}).strict()
  .refine((value) => Object.keys(value).length > 0, "At least one profile field is required.")
  .refine((value) => !value.dateOfBirth || value.dateOfBirth <= new Date().toISOString().slice(0, 10), { message: "Date of birth cannot be in the future.", path: ["dateOfBirth"] });

type ProfileRow = { id: string; email: string | null; name: string; date_of_birth: string | null; mobile_number: string | null; address: string | null; blood_group: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null; emergency_contact_relationship: string | null; secondary_emergency_contact_name: string | null; secondary_emergency_contact_phone: string | null; preferred_language: string | null; emergency_contact: string | null; allergies: string | null; known_conditions: string | null; current_medications: string | null; medical_notes: string | null; emergency_notes: string | null };
type LegacyProfileRow = Pick<ProfileRow, "id" | "name" | "mobile_number" | "blood_group" | "emergency_contact" | "medical_notes">;

export const GET = withRequestContext("GET /api/trekker/profile", async (request, _routeContext, context) => {
  const session = requestSession(request);
  if (session?.role !== "trekker") return failure("FORBIDDEN", "User access is required.", session ? 403 : 401);
  try {
    const db = getSupabaseServer();
    const result = await withHealthProfileSchemaFallback<ProfileRow, LegacyProfileRow>({
      enriched: () => db.from("trekkers").select("id, email, name, date_of_birth, mobile_number, address, blood_group, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, secondary_emergency_contact_name, secondary_emergency_contact_phone, preferred_language, emergency_contact, allergies, known_conditions, current_medications, medical_notes, emergency_notes").eq("id", session.subject).maybeSingle<ProfileRow>(),
      legacy: () => db.from("trekkers").select("id, name, mobile_number, blood_group, emergency_contact, medical_notes").eq("id", session.subject).maybeSingle<LegacyProfileRow>(),
      adaptLegacy: (row) => row ? { ...row, email: null, date_of_birth: null, address: null, emergency_contact_name: null, emergency_contact_phone: row.emergency_contact, emergency_contact_relationship: null, secondary_emergency_contact_name: null, secondary_emergency_contact_phone: null, preferred_language: null, allergies: null, known_conditions: null, current_medications: null, emergency_notes: null } : null,
      context,
      operation: "load user health profile",
      table: "trekkers",
    });
    if (!result.data) return failure("USER_NOT_FOUND", "The user profile is unavailable.", 404);
    const row = result.data;
    return success({ id: row.id, email: row.email, name: row.name, dateOfBirth: row.date_of_birth, mobileNumber: row.mobile_number, address: row.address, bloodGroup: row.blood_group, emergencyContactName: row.emergency_contact_name, emergencyContactPhone: row.emergency_contact_phone || row.emergency_contact, emergencyContactRelationship: row.emergency_contact_relationship, secondaryEmergencyContactName: row.secondary_emergency_contact_name, secondaryEmergencyContactPhone: row.secondary_emergency_contact_phone, preferredLanguage: row.preferred_language, allergies: row.allergies, knownConditions: row.known_conditions, currentMedications: row.current_medications, healthNotes: row.medical_notes, emergencyNotes: row.emergency_notes, healthProfileSchemaReady: result.healthProfileSchemaReady });
  } catch (error) {
    return databaseError(error, context, { name: "load user health profile", table: "trekkers" });
  }
});

export const PATCH = withRequestContext("PATCH /api/trekker/profile", async (request, _routeContext, context) => {
  const session = requestSession(request);
  if (session?.role !== "trekker") return failure("FORBIDDEN", "User access is required.", session ? 403 : 401);
  const parsed = await readJson(request);
  if (parsed.error) return parsed.error;
  const input = profileSchema.safeParse(parsed.data);
  if (!input.success) return validationFailure(zodMessage(input.error), zodDetails(input.error));
  const fields = { name: "name", dateOfBirth: "date_of_birth", mobileNumber: "mobile_number", address: "address", bloodGroup: "blood_group", emergencyContactName: "emergency_contact_name", emergencyContactPhone: "emergency_contact_phone", emergencyContactRelationship: "emergency_contact_relationship", secondaryEmergencyContactName: "secondary_emergency_contact_name", secondaryEmergencyContactPhone: "secondary_emergency_contact_phone", preferredLanguage: "preferred_language", allergies: "allergies", knownConditions: "known_conditions", currentMedications: "current_medications", healthNotes: "medical_notes", emergencyNotes: "emergency_notes" } as const;
  const update: Record<string, string | null> = {};
  for (const [key, column] of Object.entries(fields)) if (key in input.data) update[column] = input.data[key as keyof typeof input.data] as string | null;
  try {
    const { error } = await getSupabaseServer().from("trekkers").update(update).eq("id", session.subject);
    if (error) throw error;
    return success({ updated: true });
  } catch (error) {
    if (isHealthProfileMigrationError(error)) return failure("HEALTH_PROFILE_UPDATE_UNAVAILABLE", "The optional health profile fields are not enabled yet. Core monitoring remains available.", 409);
    return databaseError(error, context, { name: "update user health profile", table: "trekkers" });
  }
});
