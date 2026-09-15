import type { NextConfig } from "next";

// SHA del commit inyectado en build-time: visible en la UI (stepper del
// Diseño IA) para diagnosticar de un vistazo si un dispositivo corre un
// build viejo cacheado.
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA:
      process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_SHA ?? "dev",
  },
};

export default nextConfig;
