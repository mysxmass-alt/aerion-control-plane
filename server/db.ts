import { and, count, desc, eq, isNull, lt, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertStoredFile, InsertUser, magicLinkTokens, storedFiles, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod", "passwordHash"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      const value = user[field] ?? null;
      values[field] = value;
      updateSet[field] = value;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function setUserPassword(openId: string, passwordHash: string, role: "user" | "admin" = "user") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ passwordHash, role, loginMethod: "password", updatedAt: new Date() }).where(eq(users.openId, openId));
}

export async function createMagicLinkToken(email: string, tokenHash: string, expiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(magicLinkTokens).where(and(eq(magicLinkTokens.email, email), isNull(magicLinkTokens.usedAt), lt(magicLinkTokens.expiresAt, new Date())));
  await db.insert(magicLinkTokens).values({ email, tokenHash, expiresAt });
}

export async function consumeMagicLinkToken(tokenHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.select().from(magicLinkTokens).where(and(eq(magicLinkTokens.tokenHash, tokenHash), isNull(magicLinkTokens.usedAt))).limit(1);
  const token = result[0];
  if (!token || token.expiresAt.getTime() < Date.now()) return null;
  await db.update(magicLinkTokens).set({ usedAt: new Date() }).where(and(eq(magicLinkTokens.id, token.id), isNull(magicLinkTokens.usedAt)));
  return token;
}

export async function listStoredFiles(userId: number, serverName: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(storedFiles).where(and(eq(storedFiles.userId, userId), eq(storedFiles.serverName, serverName))).orderBy(desc(storedFiles.createdAt));
}

export async function createStoredFile(file: InsertStoredFile) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(storedFiles).values(file);
  const insertedId = Number(result[0].insertId);
  const created = await db.select().from(storedFiles).where(eq(storedFiles.id, insertedId)).limit(1);
  return created[0];
}

export async function deleteStoredFile(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(storedFiles).where(and(eq(storedFiles.id, id), eq(storedFiles.userId, userId)));
  return { success: true } as const;
}

export async function getAdminOverview() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [userCount] = await db.select({ value: count() }).from(users);
  const [fileCount] = await db.select({ value: count() }).from(storedFiles);
  const [storage] = await db.select({ value: sum(storedFiles.size) }).from(storedFiles);
  const recentUsers = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn }).from(users).orderBy(desc(users.lastSignedIn)).limit(8);
  return { users: userCount?.value ?? 0, files: fileCount?.value ?? 0, storageBytes: Number(storage?.value ?? 0), recentUsers };
}
