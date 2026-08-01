export const portalRoutes = {
  trekker: "/trekker/login",
  authority: "/authority/login",
} as const;

export const systemFlow = [
  ["MAX30102", "Heart rate + SpO₂"],
  ["ESP32 wristband", "Processes real samples"],
  ["Bluetooth LE", "Secure nearby link"],
  ["Trekker phone", "Browser + phone GPS"],
  ["Next.js backend", "Authenticated validation"],
  ["Supabase", "Safety records"],
  ["Authority Portal", "Shared rescue view"],
  ["WhatsApp alert", "Configured contacts"],
] as const;

export const demoSteps = [
  "Connect the wristband",
  "See MAX30102 readings",
  "Share phone location",
  "Activate SOS",
  "Review the Authority Portal",
  "Confirm notification status",
] as const;

export const limitations = [
  "Web Bluetooth requires Chrome or Edge and localhost or HTTPS.",
  "The phone needs internet to reach Supabase and WhatsApp cloud services.",
  "MAX30102 readings support safety monitoring and are not medical diagnoses.",
  "LoRa or satellite communication is a future hardware phase, not part of this prototype.",
  "A browser cannot provide the same background BLE behavior as a native mobile app.",
] as const;
