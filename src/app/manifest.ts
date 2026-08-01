import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ARGUS | Connected Trekking Safety",
    short_name: "ARGUS",
    description:
      "A hardware-and-software trekking safety prototype for trekkers and rescue teams.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3eee2",
    theme_color: "#123e30",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
