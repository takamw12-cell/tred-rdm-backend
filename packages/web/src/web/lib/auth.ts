import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_WEBSITE_URL ?? window.location.origin,
  basePath: "/api/auth",
});

// Social login buttons are shown only when explicitly enabled.
export const googleAuthEnabled =
  import.meta.env.VITE_AUTH_GOOGLE === "true";
export const appleAuthEnabled =
  import.meta.env.VITE_AUTH_APPLE === "true";
