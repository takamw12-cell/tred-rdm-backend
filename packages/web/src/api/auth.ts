import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { expo } from "@better-auth/expo";
import { db } from "./database";

// Social logins are optional: each is enabled only when its env vars are set.
const googleEnabled =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
const appleEnabled =
  !!process.env.APPLE_CLIENT_ID && !!process.env.APPLE_CLIENT_SECRET;

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.WEBSITE_URL,
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
  secret: process.env.BETTER_AUTH_SECRET,
  ...(googleEnabled || appleEnabled
    ? {
        socialProviders: {
          ...(googleEnabled
            ? {
                google: {
                  clientId: process.env.GOOGLE_CLIENT_ID!,
                  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
                },
              }
            : {}),
          ...(appleEnabled
            ? {
                apple: {
                  clientId: process.env.APPLE_CLIENT_ID!,
                  clientSecret: process.env.APPLE_CLIENT_SECRET!,
                },
              }
            : {}),
        },
      }
    : {}),
  trustedOrigins: (request) => {
    const origin = request?.headers.get("origin");
    const extra = appleEnabled ? ["https://appleid.apple.com"] : [];
    return origin ? [origin, ...extra] : ["*"];
  },
  plugins: [expo()],
});
