import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { panelEnv } from "./env";
import { SESSION_TTL_MS, createSessionToken, verifySessionToken } from "./session-token";

const COOKIE = "crm_panel_session";

export async function startSession(): Promise<void> {
  (await cookies()).set(COOKIE, createSessionToken(panelEnv().PANEL_SESSION_SECRET), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function hasSession(): Promise<boolean> {
  return verifySessionToken((await cookies()).get(COOKIE)?.value, panelEnv().PANEL_SESSION_SECRET);
}

/**
 * Her korumalı sayfa ve server action başında çağrılır. Server action'lar herkese açık
 * HTTP uç noktalarıdır; yalnızca sayfa düzeyinde kontrol yeterli değildir.
 */
export async function requireSession(): Promise<void> {
  if (!(await hasSession())) redirect("/login");
}
