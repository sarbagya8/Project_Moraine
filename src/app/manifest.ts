import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ARGUS | Trekker Safety & Emergency Response",
    short_name: "ARGUS",
    description:
      "Connected safety devices, location, SOS, and responder coordination for expeditions.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6f2",
    theme_color: "#1a3b2b",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
