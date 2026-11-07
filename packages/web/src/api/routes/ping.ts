import { base } from "../__core/app";
import { logPosthogInfo } from "../posthog-logs";

export const ping = base.handler(() => {
  logPosthogInfo("api_health_check_completed", { route: "ping" });
  return { message: `Pong! ${Date.now()}` };
});
