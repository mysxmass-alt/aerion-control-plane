import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { getUserByEmail, upsertUser, createMagicLinkToken } from "../db";
import { sdk } from "./sdk";
import { getSessionCookieOptions } from "./cookies";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ENV } from "./env";

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;
const LINK_TTL_MS = 15 * 60 * 1000;

function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320) throw new Error("Enter a valid Gmail or email address");
  return email;
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, expected] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function blocked(ip: string) {
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) { attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return false; }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

export function passwordHashForSetup(password: string) {
  if (password.length < 12 || password.length > 200) throw new Error("Password must be 12-200 characters");
  return hashPassword(password);
}

function hashToken(token: string) { return crypto.createHash("sha256").update(token).digest("hex"); }
function getBaseUrl(req: Request) { return ENV.publicAppUrl.replace(/\/$/, "") || `${req.protocol}://${req.get("host")}`; }

async function sendVerificationEmail(email: string, link: string) {
  if (!ENV.resendApiKey) throw new Error("Email verification is temporarily unavailable");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${ENV.resendApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: ENV.mailFrom,
      to: [email],
      subject: "Verify your MYSTIC HOST account",
      html: `<p>Welcome to MYSTIC HOST.</p><p>Confirm your email address to finish creating your account:</p><p><a href="${link}">Verify my MYSTIC HOST account</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
    }),
  });
  if (!response.ok) throw new Error("Email provider rejected the verification email");
}

export function registerPasswordAuthRoutes(app: Express) {
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (name.length < 2) throw new Error("Enter your name");
      const passwordHash = passwordHashForSetup(password);
      const existing = await getUserByEmail(email);
      if (existing?.passwordHash) return res.status(409).json({ error: "An account already exists for this email. Sign in instead." });
      const openId = crypto.createHash("sha256").update(`email:${email}`).digest("hex");
      await upsertUser({ openId, name, email, passwordHash, loginMethod: "password" });
      const token = crypto.randomBytes(32).toString("base64url");
      await createMagicLinkToken(email, hashToken(token), new Date(Date.now() + LINK_TTL_MS));
      await sendVerificationEmail(email, `${getBaseUrl(req)}/api/auth/verify?token=${encodeURIComponent(token)}`);
      res.status(202).json({ ok: true });
    } catch (error) {
      console.error("[Auth] Registration failed", error);
      res.status(400).json({ error: error instanceof Error ? error.message : "Unable to create account" });
    }
  });

  app.post("/api/auth/password", async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (blocked(ip)) return res.status(429).json({ error: "Too many login attempts. Try again later." });
    try {
      const email = normalizeEmail(req.body?.email);
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const user = await getUserByEmail(email);
      if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: "Invalid email or password" });
      const session = await sdk.createSessionToken(user.openId, { name: user.name || email, expiresInMs: ONE_YEAR_MS });
      await upsertUser({ openId: user.openId, lastSignedIn: new Date() });
      res.cookie(COOKIE_NAME, session, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.json({ ok: true });
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Invalid credentials" }); }
  });
}
