import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { upsertUser, createMagicLinkToken, consumeMagicLinkToken } from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { getSessionCookieOptions } from "./cookies";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINK_TTL_MS = 15 * 60 * 1000;

function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 320) throw new Error("A valid email address is required");
  return email;
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function sendMagicLink(email: string, link: string) {
  if (!ENV.resendApiKey) {
    if (ENV.isProduction) throw new Error("RESEND_API_KEY is not configured");
    console.info(`[MagicLink] Development sign-in URL for ${email}: ${link}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${ENV.resendApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: ENV.mailFrom,
      to: [email],
      subject: "Your Aerion sign-in link",
      html: `<p>Sign in to Aerion Control Plane:</p><p><a href="${link}">Open Aerion</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
    }),
  });
  if (!response.ok) throw new Error("Email provider rejected the magic link");
}

function getBaseUrl(req: Request) {
  return ENV.publicAppUrl.replace(/\/$/, "") || `${req.protocol}://${req.get("host")}`;
}

export function registerMagicLinkRoutes(app: Express) {
  app.post("/api/auth/request-link", async (req: Request, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const token = crypto.randomBytes(32).toString("base64url");
      await createMagicLinkToken(email, hashToken(token), new Date(Date.now() + LINK_TTL_MS));
      const link = `${getBaseUrl(req)}/api/auth/verify?token=${encodeURIComponent(token)}`;
      await sendMagicLink(email, link);
      res.status(202).json({ ok: true });
    } catch (error) {
      console.error("[MagicLink] Request failed", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Unable to send sign-in link" });
    }
  });

  app.get("/api/auth/verify", async (req: Request, res: Response) => {
    try {
      const token = typeof req.query.token === "string" ? req.query.token : "";
      if (!token) return res.status(400).send("Missing sign-in token");
      const record = await consumeMagicLinkToken(hashToken(token));
      if (!record) return res.status(401).send("This sign-in link is invalid or expired");
      const openId = crypto.createHash("sha256").update(`email:${record.email}`).digest("hex");
      await upsertUser({ openId, name: record.email, email: record.email, loginMethod: "magic-link", lastSignedIn: new Date() });
      const session = await sdk.createSessionToken(openId, { name: record.email, expiresInMs: ONE_YEAR_MS });
      res.cookie(COOKIE_NAME, session, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[MagicLink] Verification failed", error);
      res.status(400).send("Unable to complete sign-in");
    }
  });
}
