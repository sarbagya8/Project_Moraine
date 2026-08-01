export const portalRoutes = {
  trekker: "/trekker/login",
  authority: "/authority/login",
} as const;

export const navLinks = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Demo", href: "#demo" },
  { label: "SOS flow", href: "#sos-flow" },
  { label: "Prototype", href: "#prototype" },
  { label: "About", href: "#about" },
] as const;

export const systemPhases = [
  {
    label: "Wearable",
    visual: "wearable",
    description: "The wristband reads the available signal and gives the trekker a physical SOS button.",
    nodes: ["MAX30102", "ESP32 wristband"],
    note: "Invalid readings stay unavailable.",
  },
  {
    label: "Trekker side",
    visual: "trekker",
    description: "A supported browser connects over BLE, captures location, and records symptoms.",
    nodes: ["Bluetooth Low Energy", "Trekker Portal", "Location + symptoms"],
    note: "Live and stale states stay distinct.",
  },
  {
    label: "Secure platform",
    visual: "platform",
    description: "Authenticated services verify ownership, validate data, and store the shared record.",
    nodes: ["Authenticated backend", "Supabase"],
    note: "Repeated SOS delivery does not create duplicates.",
  },
  {
    label: "Rescue side",
    visual: "rescue",
    description: "Authorities receive the emergency context, map, Rescue Passport, and delivery state.",
    nodes: ["Authority Portal", "WhatsApp emergency alert"],
    note: "Provider delivery state is tracked.",
  },
] as const;

export const demoSteps = [
  "Connect wristband",
  "Receive sensor readings",
  "Capture location",
  "Trigger SOS",
  "Review in Authority Portal",
  "Receive WhatsApp emergency alert",
] as const;

export const sosSteps = [
  {
    title: "SOS activated",
    detail: "Maya holds the wristband button. The Trekker Portal also offers a confirmed SOS action.",
  },
  {
    title: "Latest context captured",
    detail: "ARGUS gathers the latest available reading, browser location, symptoms, and event time.",
  },
  {
    title: "Rescue record created",
    detail: "The backend validates the request and stores one emergency record for the event.",
  },
  {
    title: "People are notified",
    detail: "The Authority Portal shows the SOS and WhatsApp sends map and Rescue Passport access.",
  },
] as const;

export const roadmapPhases = [
  {
    phase: "Phase 1",
    label: "Current prototype",
    status: "Working now",
    current: true,
    items: [
      "ESP32 wristband",
      "MAX30102",
      "BLE connection",
      "Browser-based location",
      "Symptom reports",
      "Trekker Portal",
      "Authority Portal",
      "SOS record with duplicate protection",
      "Rescue Passport",
      "WhatsApp emergency alert",
    ],
  },
  {
    phase: "Phase 2",
    label: "Field-ready pilot",
    status: "Future work",
    current: false,
    items: [
      "Low-power GNSS module",
      "Battery monitoring",
      "Compact custom PCB",
      "Wearable enclosure",
      "Native mobile application",
      "Stronger offline queue",
      "Signed Rescue Passport links",
      "Field testing with guides and agencies",
    ],
  },
  {
    phase: "Phase 3",
    label: "Trail communication network",
    status: "Future work",
    current: false,
    items: [
      "LoRa emergency packets",
      "Gateways at lodges or checkpoints",
      "Store-and-forward communication",
      "Cellular or satellite fallback for remote areas",
      "Rescue organisation integration",
      "Larger-scale field validation",
    ],
  },
] as const;
