import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';

// Import schemas
import {
  loginInputSchema,
  createUserInputSchema,
  updateUserInputSchema,
  createGameInputSchema,
  updateGameInputSchema,
  createLicenseKeyInputSchema,
  bulkCreateLicenseKeysInputSchema,
  updateLicenseKeyInputSchema,
  searchLicenseKeysInputSchema,
  activateLicenseInputSchema,
  resetDeviceLockInputSchema,
  createActivityLogInputSchema,
  userRoleSchema
} from './schema';

// Import handlers
import { authenticateUser } from './handlers/auth';
import { 
  createUser, 
  updateUser, 
  getUserById, 
  getUsers, 
  deleteUser 
} from './handlers/users';
import { 
  createGame, 
  updateGame, 
  getGameById, 
  getGames, 
  deleteGame 
} from './handlers/games';
import { 
  createLicenseKey,
  bulkCreateLicenseKeys,
  updateLicenseKey,
  searchLicenseKeys,
  getLicenseKeyById,
  getLicenseKeyByKey,
  activateLicenseKey,
  resetDeviceLock,
  getExpiringKeys
} from './handlers/license_keys';
import { 
  createActivityLog,
  getActivityLogs,
  getTodayLoginCount,
  getRecentActivity
} from './handlers/activity_logs';
import { 
  getDashboardStats, 
  getResellerStats 
} from './handlers/dashboard';
import { z } from 'zod';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  auth: router({
    login: publicProcedure
      .input(loginInputSchema)
      .mutation(({ input }) => authenticateUser(input)),
  }),

  // User management routes
  users: router({
    create: publicProcedure
      .input(createUserInputSchema)
      .mutation(({ input }) => createUser(input)),
    
    update: publicProcedure
      .input(updateUserInputSchema)
      .mutation(({ input }) => updateUser(input)),
    
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getUserById(input.id)),
    
    getAll: publicProcedure
      .input(z.object({ role: userRoleSchema.optional() }))
      .query(({ input }) => getUsers(input.role)),
    
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteUser(input.id)),
  }),

  // Game management routes
  games: router({
    create: publicProcedure
      .input(createGameInputSchema)
      .mutation(({ input }) => createGame(input)),
    
    update: publicProcedure
      .input(updateGameInputSchema)
      .mutation(({ input }) => updateGame(input)),
    
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getGameById(input.id)),
    
    getAll: publicProcedure
      .input(z.object({ activeOnly: z.boolean().default(false) }))
      .query(({ input }) => getGames(input.activeOnly)),
    
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteGame(input.id)),
  }),

  // License key management routes
  licenseKeys: router({
    create: publicProcedure
      .input(createLicenseKeyInputSchema)
      .mutation(({ input }) => createLicenseKey(input)),
    
    bulkCreate: publicProcedure
      .input(bulkCreateLicenseKeysInputSchema)
      .mutation(({ input }) => bulkCreateLicenseKeys(input)),
    
    update: publicProcedure
      .input(updateLicenseKeyInputSchema)
      .mutation(({ input }) => updateLicenseKey(input)),
    
    search: publicProcedure
      .input(searchLicenseKeysInputSchema)
      .query(({ input }) => searchLicenseKeys(input)),
    
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getLicenseKeyById(input.id)),
    
    getByKey: publicProcedure
      .input(z.object({ key: z.string() }))
      .query(({ input }) => getLicenseKeyByKey(input.key)),
    
    activate: publicProcedure
      .input(activateLicenseInputSchema)
      .mutation(({ input }) => activateLicenseKey(input)),
    
    resetDeviceLock: publicProcedure
      .input(resetDeviceLockInputSchema)
      .mutation(({ input }) => resetDeviceLock(input)),
    
    getExpiring: publicProcedure
      .input(z.object({ daysAhead: z.number().default(3) }))
      .query(({ input }) => getExpiringKeys(input.daysAhead)),
  }),

  // Activity log routes
  activityLogs: router({
    create: publicProcedure
      .input(createActivityLogInputSchema)
      .mutation(({ input }) => createActivityLog(input)),
    
    getByLicenseKey: publicProcedure
      .input(z.object({ 
        licenseKeyId: z.number().optional(),
        limit: z.number().default(100)
      }))
      .query(({ input }) => getActivityLogs(input.licenseKeyId, input.limit)),
    
    getTodayCount: publicProcedure
      .query(() => getTodayLoginCount()),
    
    getRecent: publicProcedure
      .input(z.object({ limit: z.number().default(50) }))
      .query(({ input }) => getRecentActivity(input.limit)),
  }),

  // Dashboard routes
  dashboard: router({
    getStats: publicProcedure
      .query(() => getDashboardStats()),
    
    getResellerStats: publicProcedure
      .input(z.object({ resellerId: z.number() }))
      .query(({ input }) => getResellerStats(input.resellerId)),
  }),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC License Management server listening at port: ${port}`);
}

start();