import type { Tx } from "@/db";
import { portalTokens } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";

const PORTAL_DAYS = 7;

/** Creates a 7-day magic link to the patient portal. The raw token only lives in the URL. */
export async function createPortalLink(t: Tx, tenantId: string, patientId: string): Promise<string> {
  const token = randomToken(24);
  await t.insert(portalTokens).values({ tenantId, patientId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + PORTAL_DAYS * 86400_000) });
  return `${process.env.APP_URL ?? "http://localhost:3000"}/portal/${token}`;
}
