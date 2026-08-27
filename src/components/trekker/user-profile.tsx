"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ErrorState, LoadingState } from "@/components/shared/portal-ui";
import { portalRequest } from "@/lib/portal-api";

type Profile = {
  id: string;
  email: string | null;
  name: string;
  dateOfBirth: string | null;
  mobileNumber: string | null;
  address: string | null;
  bloodGroup: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  allergies: string | null;
  knownConditions: string | null;
  currentMedications: string | null;
  healthNotes: string | null;
  emergencyNotes: string | null;
  healthProfileSchemaReady: boolean;
};

export function UserProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setProfile(await portalRequest<Profile>("/api/trekker/profile"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your profile could not be loaded.");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  async function save(formData: FormData) {
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      await portalRequest("/api/trekker/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: formData.get("name"),
          dateOfBirth: formData.get("dateOfBirth") || null,
          mobileNumber: formData.get("mobileNumber") || null,
          address: formData.get("address") || null,
          bloodGroup: formData.get("bloodGroup") || null,
          emergencyContactName: formData.get("emergencyContactName") || null,
          emergencyContactPhone: formData.get("emergencyContactPhone") || null,
          allergies: formData.get("allergies") || null,
          knownConditions: formData.get("knownConditions") || null,
          currentMedications: formData.get("currentMedications") || null,
          healthNotes: formData.get("healthNotes") || null,
          emergencyNotes: formData.get("emergencyNotes") || null,
        }),
      });
      await load();
      setMessage("Profile saved successfully.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Your profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <main className="portal-page"><ErrorState message={error} retry={() => void load()} /></main>;
  if (!profile) return <main className="portal-page"><LoadingState label="Loading your profile…" /></main>;

  return (
    <main className="min-h-screen bg-[#f7f5f0] topo-contour-cream py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between border-b border-[#d8ded4] pb-5">
          <div>
            <p className="eyebrow">Trekker Portal</p>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#0a2e1c] tracking-tight">My Expedition Profile</h1>
            <p className="text-sm text-[#576b5d] mt-1">Manage emergency contacts and voluntary field response details.</p>
          </div>
          <Link className="secondary-button" href="/user/dashboard">Back to Cockpit</Link>
        </div>

        {!profile.healthProfileSchemaReady ? (
          <div className="bg-[#fff8e7] border border-[#e3cea0] text-[#6d521b] p-4 rounded-xl text-sm">
            Optional response-profile storage is initializing in Supabase. Essential monitoring remains active.
          </div>
        ) : null}
        {message ? (
          <div className="bg-[#edf4ed] border border-[#b8cfbc] text-[#21573b] p-4 rounded-xl text-sm font-semibold" role="status">
            {message}
          </div>
        ) : null}

        {/* Profile Settings Card (Reference Image 1) */}
        <section className="forest-card space-y-6">
          <div className="border-b border-[#1b5435] pb-3">
            <p className="eyebrow">Profile Settings</p>
            <h2 className="text-2xl font-bold">Personal &amp; Medical Notes</h2>
          </div>

          <form className="space-y-4" action={(form) => void save(form)}>
            <div>
              <label>Full Name
                <input name="name" defaultValue={profile.name} required />
              </label>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label>Date of Birth
                <input name="dateOfBirth" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={profile.dateOfBirth || ""} />
              </label>
              <label>Phone Number
                <input name="mobileNumber" type="tel" defaultValue={profile.mobileNumber || ""} />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label>Area / Address
                <input name="address" defaultValue={profile.address || ""} />
              </label>
              <label>Blood Group
                <select name="bloodGroup" defaultValue={profile.bloodGroup || ""}>
                  <option value="">Not provided</option>
                  {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label>Medical &amp; Expedition Notes
                <textarea
                  name="healthNotes"
                  rows={3}
                  defaultValue={profile.healthNotes || ""}
                  placeholder="Medical conditions, known allergies, baseline notes..."
                />
              </label>
            </div>

            <div>
              <label>Allergies &amp; Medications
                <textarea
                  name="allergies"
                  rows={2}
                  defaultValue={profile.allergies || ""}
                  placeholder="Known allergies or regular medication..."
                />
              </label>
            </div>

            <div>
              <label>Emergency Triage Notes
                <textarea
                  name="emergencyNotes"
                  rows={2}
                  defaultValue={profile.emergencyNotes || ""}
                  placeholder="Specific instructions for rescue teams..."
                />
              </label>
            </div>

            <div className="border-t border-[#1b5435] pt-5 mt-6">
              <p className="eyebrow">Emergency Contacts</p>
              <h3 className="text-xl font-bold mb-4">Designated Safety Contacts</h3>

              <div className="space-y-4">
                <label>Primary Contact Name
                  <input name="emergencyContactName" defaultValue={profile.emergencyContactName || ""} placeholder="Contact Name" />
                </label>
                <label>Primary Contact Phone
                  <input name="emergencyContactPhone" type="tel" defaultValue={profile.emergencyContactPhone || ""} placeholder="+1-xxx-xxx-xxxx" />
                </label>
              </div>
            </div>

            <div className="pt-4">
              <button className="primary-button w-full sm:w-auto" type="submit" disabled={saving || !profile.healthProfileSchemaReady}>
                {saving ? "Saving Profile…" : "Save Expedition Profile"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
