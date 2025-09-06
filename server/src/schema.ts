import { z } from 'zod';

// User roles enum
export const userRoleSchema = z.enum(['developer', 'reseller', 'user']);
export type UserRole = z.infer<typeof userRoleSchema>;

// License status enum
export const licenseStatusSchema = z.enum(['active', 'expired', 'suspended', 'pending']);
export type LicenseStatus = z.infer<typeof licenseStatusSchema>;

// User schema
export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  password_hash: z.string(),
  role: userRoleSchema,
  full_name: z.string(),
  email: z.string().nullable(),
  quota: z.number().nullable(), // For resellers - how many keys they can generate
  allocated_games: z.string().array().nullable(), // For resellers - which games they can manage
  created_at: z.coerce.date(),
  updated_at: z.coerce.date().nullable(),
  is_active: z.boolean()
});

export type User = z.infer<typeof userSchema>;

// Game schema
export const gameSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  version: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date()
});

export type Game = z.infer<typeof gameSchema>;

// License key schema
export const licenseKeySchema = z.object({
  id: z.number(),
  key: z.string(),
  game_id: z.number(),
  customer_name: z.string(),
  customer_email: z.string().nullable(),
  device_id: z.string().nullable(),
  status: licenseStatusSchema,
  expires_at: z.coerce.date(),
  notes: z.string().nullable(),
  created_by: z.number(), // User ID who created the key
  created_at: z.coerce.date(),
  updated_at: z.coerce.date().nullable(),
  last_used_at: z.coerce.date().nullable()
});

export type LicenseKey = z.infer<typeof licenseKeySchema>;

// Activity log schema
export const activityLogSchema = z.object({
  id: z.number(),
  license_key_id: z.number(),
  device_id: z.string(),
  action: z.string(), // 'login', 'device_lock', 'key_reset', etc.
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  created_at: z.coerce.date()
});

export type ActivityLog = z.infer<typeof activityLogSchema>;

// Input schemas for creating/updating entities

// User creation/update inputs
export const createUserInputSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  role: userRoleSchema,
  full_name: z.string(),
  email: z.string().email().nullable(),
  quota: z.number().positive().nullable(),
  allocated_games: z.string().array().nullable()
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z.object({
  id: z.number(),
  username: z.string().min(3).optional(),
  password: z.string().min(6).optional(),
  full_name: z.string().optional(),
  email: z.string().email().nullable().optional(),
  quota: z.number().positive().nullable().optional(),
  allocated_games: z.string().array().nullable().optional(),
  is_active: z.boolean().optional()
});

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

// Game creation/update inputs
export const createGameInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  version: z.string().nullable()
});

export type CreateGameInput = z.infer<typeof createGameInputSchema>;

export const updateGameInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  is_active: z.boolean().optional()
});

export type UpdateGameInput = z.infer<typeof updateGameInputSchema>;

// License key creation/update inputs
export const createLicenseKeyInputSchema = z.object({
  game_id: z.number(),
  customer_name: z.string().min(1),
  customer_email: z.string().email().nullable(),
  expires_at: z.coerce.date(),
  notes: z.string().nullable(),
  created_by: z.number()
});

export type CreateLicenseKeyInput = z.infer<typeof createLicenseKeyInputSchema>;

export const bulkCreateLicenseKeysInputSchema = z.object({
  game_id: z.number(),
  customer_names: z.string().array(),
  customer_emails: z.string().email().nullable().array().optional(),
  expires_at: z.coerce.date(),
  notes: z.string().nullable(),
  created_by: z.number()
});

export type BulkCreateLicenseKeysInput = z.infer<typeof bulkCreateLicenseKeysInputSchema>;

export const updateLicenseKeyInputSchema = z.object({
  id: z.number(),
  customer_name: z.string().min(1).optional(),
  customer_email: z.string().email().nullable().optional(),
  status: licenseStatusSchema.optional(),
  expires_at: z.coerce.date().optional(),
  notes: z.string().nullable().optional()
});

export type UpdateLicenseKeyInput = z.infer<typeof updateLicenseKeyInputSchema>;

// Authentication inputs
export const loginInputSchema = z.object({
  username: z.string(),
  password: z.string()
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const activateLicenseInputSchema = z.object({
  license_key: z.string(),
  device_id: z.string()
});

export type ActivateLicenseInput = z.infer<typeof activateLicenseInputSchema>;

// Search and filter inputs
export const searchLicenseKeysInputSchema = z.object({
  game_id: z.number().optional(),
  customer_name: z.string().optional(),
  status: licenseStatusSchema.optional(),
  license_key: z.string().optional(),
  created_by: z.number().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20)
});

export type SearchLicenseKeysInput = z.infer<typeof searchLicenseKeysInputSchema>;

// Device management inputs
export const resetDeviceLockInputSchema = z.object({
  license_key_id: z.number(),
  admin_user_id: z.number()
});

export type ResetDeviceLockInput = z.infer<typeof resetDeviceLockInputSchema>;

// Activity log input
export const createActivityLogInputSchema = z.object({
  license_key_id: z.number(),
  device_id: z.string(),
  action: z.string(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable()
});

export type CreateActivityLogInput = z.infer<typeof createActivityLogInputSchema>;

// Dashboard statistics schema
export const dashboardStatsSchema = z.object({
  total_resellers: z.number(),
  total_active_keys: z.number(),
  total_expired_keys: z.number(),
  total_logins_today: z.number(),
  expiring_keys_3_days: z.number()
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

// License details for loader response
export const licenseDetailsSchema = z.object({
  license_key: z.string(),
  game_name: z.string(),
  customer_name: z.string(),
  device_id: z.string().nullable(),
  expires_at: z.coerce.date(),
  status: licenseStatusSchema,
  notes: z.string().nullable(),
  days_until_expiry: z.number(),
  is_expiring_soon: z.boolean()
});

export type LicenseDetails = z.infer<typeof licenseDetailsSchema>;