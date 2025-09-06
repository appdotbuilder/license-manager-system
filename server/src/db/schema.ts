import { 
  serial, 
  text, 
  pgTable, 
  timestamp, 
  integer, 
  boolean,
  pgEnum,
  varchar
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['developer', 'reseller', 'user']);
export const licenseStatusEnum = pgEnum('license_status', ['active', 'expired', 'suspended', 'pending']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  password_hash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull(),
  full_name: varchar('full_name', { length: 100 }).notNull(),
  email: varchar('email', { length: 100 }),
  quota: integer('quota'), // For resellers - how many keys they can generate
  allocated_games: text('allocated_games').array(), // JSON array of game IDs for resellers
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at'),
  is_active: boolean('is_active').default(true).notNull()
});

// Games table
export const gamesTable = pgTable('games', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  version: varchar('version', { length: 20 }),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// License keys table
export const licenseKeysTable = pgTable('license_keys', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 50 }).notNull().unique(),
  game_id: integer('game_id').notNull().references(() => gamesTable.id),
  customer_name: varchar('customer_name', { length: 100 }).notNull(),
  customer_email: varchar('customer_email', { length: 100 }),
  device_id: varchar('device_id', { length: 200 }), // Device identifier for locking
  status: licenseStatusEnum('status').default('active').notNull(),
  expires_at: timestamp('expires_at').notNull(),
  notes: text('notes'),
  created_by: integer('created_by').notNull().references(() => usersTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at'),
  last_used_at: timestamp('last_used_at')
});

// Activity logs table
export const activityLogsTable = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  license_key_id: integer('license_key_id').notNull().references(() => licenseKeysTable.id),
  device_id: varchar('device_id', { length: 200 }).notNull(),
  action: varchar('action', { length: 50 }).notNull(), // 'login', 'device_lock', 'key_reset', etc.
  ip_address: varchar('ip_address', { length: 45 }),
  user_agent: text('user_agent'),
  created_at: timestamp('created_at').defaultNow().notNull()
});

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  createdLicenseKeys: many(licenseKeysTable)
}));

export const gamesRelations = relations(gamesTable, ({ many }) => ({
  licenseKeys: many(licenseKeysTable)
}));

export const licenseKeysRelations = relations(licenseKeysTable, ({ one, many }) => ({
  game: one(gamesTable, {
    fields: [licenseKeysTable.game_id],
    references: [gamesTable.id]
  }),
  creator: one(usersTable, {
    fields: [licenseKeysTable.created_by],
    references: [usersTable.id]
  }),
  activityLogs: many(activityLogsTable)
}));

export const activityLogsRelations = relations(activityLogsTable, ({ one }) => ({
  licenseKey: one(licenseKeysTable, {
    fields: [activityLogsTable.license_key_id],
    references: [licenseKeysTable.id]
  })
}));

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type Game = typeof gamesTable.$inferSelect;
export type NewGame = typeof gamesTable.$inferInsert;

export type LicenseKey = typeof licenseKeysTable.$inferSelect;
export type NewLicenseKey = typeof licenseKeysTable.$inferInsert;

export type ActivityLog = typeof activityLogsTable.$inferSelect;
export type NewActivityLog = typeof activityLogsTable.$inferInsert;

// Export all tables and relations for proper query building
export const tables = {
  users: usersTable,
  games: gamesTable,
  licenseKeys: licenseKeysTable,
  activityLogs: activityLogsTable
};

export const tableRelations = {
  usersRelations,
  gamesRelations,
  licenseKeysRelations,
  activityLogsRelations
};