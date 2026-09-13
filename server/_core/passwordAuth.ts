import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { getUserByEmail, upsertUser } from "../db";
import { sdk } from "./sdk";
import { getSessionCookieOptions } from "./cookies";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

function normalizeEmail(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320) throw new Error("Invalid credentials");
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
  if (!current || current.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

export function passwordHashForSetup(password: string) {
  if (password.length < 12 || password.length > 200) throw new Error("Password must be 12-200 characters");
  return hashPassword(password);
}

export function registerPasswordAuthRoutes(app: Express) {
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
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid credentials" });
    }
  });
}
