import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/trekker/login", destination: "/user/login", permanent: false },
      { source: "/trekker/setup", destination: "/user/login", permanent: false },
      { source: "/trekker/dashboard", destination: "/user/dashboard", permanent: false },
      { source: "/trekker/:path*", destination: "/user/dashboard", permanent: false },
      { source: "/authority/login", destination: "/responder/login", permanent: false },
      { source: "/authority/dashboard", destination: "/responder/dashboard", permanent: false },
      { source: "/authority/emergencies/:id", destination: "/responder/cases/:id", permanent: false },
      { source: "/authority/emergencies", destination: "/responder/cases", permanent: false },
      { source: "/authority/trekkers/:id", destination: "/responder/users/:id", permanent: false },
      { source: "/authority/trekkers", destination: "/responder/users", permanent: false },
      { source: "/authority/:path*", destination: "/responder/:path*", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
