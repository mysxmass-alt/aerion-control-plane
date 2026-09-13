import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { allowedRuntimeSlugs, billingPlans, runtimeTemplates } from "@shared/catalog";
import { createStoredFile, deleteStoredFile, getAdminOverview, listStoredFiles } from "./db";
import { storagePut } from "./storage";
import { createNodeServer, deleteNodeServer, listNodeServers, nodeAction, nodeCommand, nodeExtractZip, nodeFileAction, nodeHealth, nodeListFiles, nodeLogs, nodeStartup, nodeStats, nodeUploadFile, updateNodeStartup } from "./nodeAgent";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function safeFileName(value: string) {
  const trimmed = value.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
  return trimmed.slice(0, 180) || "uploaded-file";
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("File payload must be a base64 data URL");
  const [, mimeType, encoded] = match;
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) throw new Error("File payload is empty");
  if (buffer.byteLength > MAX_UPLOAD_BYTES) throw new Error("Files must be 10 MB or smaller");
  return { mimeType, buffer };
}

export const appRouter = router({
  system: systemRouter,
  catalog: router({
    runtimes: publicProcedure.query(() => runtimeTemplates),
    plans: publicProcedure.query(() => billingPlans),
  }),
  auth: router({
    me: publicProcedure.query(opts => {
      if (!opts.ctx.user) return null;
      const { passwordHash: _passwordHash, ...safeUser } = opts.ctx.user;
      return safeUser;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  admin: router({
    overview: adminProcedure.query(() => getAdminOverview()),
    nodeHealth: adminProcedure.query(() => nodeHealth()),
    nodeServers: adminProcedure.query(() => listNodeServers()),
    createServer: adminProcedure
      .input(z.object({ name: z.string().min(2).max(48), runtime: z.enum(allowedRuntimeSlugs), memoryMb: z.number().int().min(128).max(8192), cpu: z.number().min(0.1).max(4) }))
      .mutation(({ input }) => createNodeServer(input)),
    deleteServer: adminProcedure.input(z.object({ name: z.string().min(2).max(48) })).mutation(({ input }) => deleteNodeServer(input.name)),
  }),
  node: router({
    servers: protectedProcedure.query(() => listNodeServers()),
    create: protectedProcedure
      .input(z.object({ name: z.string().min(2).max(48), runtime: z.enum(allowedRuntimeSlugs), memoryMb: z.number().int().min(128).max(8192), cpu: z.number().min(0.1).max(4) }))
      .mutation(({ input }) => createNodeServer(input)),
    delete: protectedProcedure.input(z.object({ name: z.string().min(2).max(48) })).mutation(({ input }) => deleteNodeServer(input.name)),
    startup: protectedProcedure.input(z.object({ name: z.string().min(2).max(48) })).query(({ input }) => nodeStartup(input.name)),
    updateStartup: protectedProcedure.input(z.object({ name: z.string().min(2).max(48), runtime: z.string().min(1), command: z.string().min(1).max(1000), env: z.record(z.string(), z.string()).default({}) })).mutation(({ input }) => updateNodeStartup(input.name, { runtime: input.runtime, command: input.command, env: input.env })),
    command: protectedProcedure.input(z.object({ name: z.string().min(2).max(48), command: z.string().min(1).max(500) })).mutation(({ input }) => nodeCommand(input.name, input.command)),
    action: protectedProcedure
      .input(z.object({ name: z.string().min(2).max(48), action: z.enum(["start", "stop", "restart"]) }))
      .mutation(({ input }) => nodeAction(input.name, input.action)),
    logs: protectedProcedure
      .input(z.object({ name: z.string().min(2).max(48) }))
      .query(({ input }) => nodeLogs(input.name)),
    stats: protectedProcedure
      .input(z.object({ name: z.string().min(2).max(48) }))
      .query(({ input }) => nodeStats(input.name)),
  }),
  files: router({
    list: protectedProcedure
      .input(z.object({ serverName: z.string().min(1).max(100) }))
      .query(({ ctx, input }) => nodeListFiles(input.serverName)),
    upload: protectedProcedure
      .input(z.object({ serverName: z.string().min(1).max(100), fileName: z.string().min(1).max(255), mimeType: z.string().min(1).max(150), size: z.number().int().nonnegative().max(MAX_UPLOAD_BYTES), dataUrl: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const { mimeType, buffer } = decodeDataUrl(input.dataUrl);
        if (input.size !== buffer.byteLength) throw new Error("File size did not match the uploaded payload");
        const name = safeFileName(input.fileName);
        const upload = await storagePut(`${ctx.user.id}/servers/${input.serverName}/${name}`, buffer, mimeType);
        await nodeUploadFile(input.serverName, name, buffer);
        return createStoredFile({ userId: ctx.user.id, serverName: input.serverName, originalName: input.fileName, storageKey: upload.key, storageUrl: upload.url, mimeType, size: buffer.byteLength });
      }),
    extract: protectedProcedure
      .input(z.object({ serverName: z.string().min(1).max(100), fileName: z.string().min(1).max(255) }))
      .mutation(({ input }) => nodeExtractZip(input.serverName, safeFileName(input.fileName))),
    action: protectedProcedure
      .input(z.object({ serverName: z.string().min(1).max(100), action: z.enum(["move", "rename", "copy", "delete"]), source: z.string().min(1).max(500), destination: z.string().max(500).optional() }))
      .mutation(({ input }) => nodeFileAction(input.serverName, input)),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => deleteStoredFile(ctx.user.id, input.id)),
  }),
});

export type AppRouter = typeof appRouter;
