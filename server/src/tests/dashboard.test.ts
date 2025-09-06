import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, gamesTable, licenseKeysTable, activityLogsTable } from '../db/schema';
import { getDashboardStats, getResellerStats } from '../handlers/dashboard';
import { eq } from 'drizzle-orm';

// Test data setup
const createTestUser = async (role: 'developer' | 'reseller' | 'user' = 'reseller', quota: number | null = 100) => {
  const result = await db.insert(usersTable)
    .values({
      username: `testuser_${Math.random().toString(36).substring(7)}`,
      password_hash: 'hashed_password',
      role: role,
      full_name: 'Test User',
      email: 'test@example.com',
      quota: quota,
      allocated_games: null,
      is_active: true
    })
    .returning()
    .execute();
  return result[0];
};

const createTestGame = async () => {
  const result = await db.insert(gamesTable)
    .values({
      name: 'Test Game',
      description: 'A game for testing',
      version: '1.0.0',
      is_active: true
    })
    .returning()
    .execute();
  return result[0];
};

const createTestLicenseKey = async (
  gameId: number, 
  createdBy: number, 
  status: 'active' | 'expired' | 'suspended' | 'pending' = 'active',
  expiresAt: Date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
) => {
  const result = await db.insert(licenseKeysTable)
    .values({
      key: `TEST-KEY-${Math.random().toString(36).substring(7).toUpperCase()}`,
      game_id: gameId,
      customer_name: 'Test Customer',
      customer_email: 'customer@example.com',
      device_id: null,
      status: status,
      expires_at: expiresAt,
      notes: null,
      created_by: createdBy
    })
    .returning()
    .execute();
  return result[0];
};

const createTestActivityLog = async (
  licenseKeyId: number, 
  action: string = 'login',
  createdAt: Date = new Date()
) => {
  const result = await db.insert(activityLogsTable)
    .values({
      license_key_id: licenseKeyId,
      device_id: 'test-device',
      action: action,
      ip_address: '192.168.1.1',
      user_agent: 'Test Agent',
      created_at: createdAt
    })
    .returning()
    .execute();
  return result[0];
};

describe('getDashboardStats', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return zero stats for empty database', async () => {
    const stats = await getDashboardStats();

    expect(stats.total_resellers).toEqual(0);
    expect(stats.total_active_keys).toEqual(0);
    expect(stats.total_expired_keys).toEqual(0);
    expect(stats.total_logins_today).toEqual(0);
    expect(stats.expiring_keys_3_days).toEqual(0);
  });

  it('should count resellers correctly', async () => {
    // Create different types of users
    await createTestUser('reseller', 100);
    await createTestUser('reseller', 200);
    await createTestUser('developer', null);
    await createTestUser('user', null);
    
    // Create inactive reseller (should not be counted)
    const inactiveReseller = await createTestUser('reseller', 50);
    await db.update(usersTable)
      .set({ is_active: false })
      .where(eq(usersTable.id, inactiveReseller.id))
      .execute();

    const stats = await getDashboardStats();

    expect(stats.total_resellers).toEqual(2); // Only active resellers
  });

  it('should count license keys by status correctly', async () => {
    const reseller = await createTestUser('reseller', 100);
    const game = await createTestGame();

    // Create keys with different statuses
    await createTestLicenseKey(game.id, reseller.id, 'active');
    await createTestLicenseKey(game.id, reseller.id, 'active');
    await createTestLicenseKey(game.id, reseller.id, 'expired');
    await createTestLicenseKey(game.id, reseller.id, 'suspended');
    await createTestLicenseKey(game.id, reseller.id, 'pending');

    const stats = await getDashboardStats();

    expect(stats.total_active_keys).toEqual(2);
    expect(stats.total_expired_keys).toEqual(1);
  });

  it('should count today\'s logins correctly', async () => {
    const reseller = await createTestUser('reseller', 100);
    const game = await createTestGame();
    const licenseKey = await createTestLicenseKey(game.id, reseller.id);

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Create login activities
    await createTestActivityLog(licenseKey.id, 'login', today);
    await createTestActivityLog(licenseKey.id, 'login', today);
    await createTestActivityLog(licenseKey.id, 'device_lock', today); // Different action
    await createTestActivityLog(licenseKey.id, 'login', yesterday); // Different date

    const stats = await getDashboardStats();

    expect(stats.total_logins_today).toEqual(2); // Only today's logins
  });

  it('should count expiring keys correctly', async () => {
    const reseller = await createTestUser('reseller', 100);
    const game = await createTestGame();

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const in2Days = new Date(today);
    in2Days.setDate(in2Days.getDate() + 2);
    
    const in4Days = new Date(today);
    in4Days.setDate(in4Days.getDate() + 4);
    
    const pastDate = new Date(today);
    pastDate.setDate(pastDate.getDate() - 1);

    // Create keys with different expiration dates
    await createTestLicenseKey(game.id, reseller.id, 'active', tomorrow);
    await createTestLicenseKey(game.id, reseller.id, 'active', in2Days);
    await createTestLicenseKey(game.id, reseller.id, 'active', in4Days); // Beyond 3 days
    await createTestLicenseKey(game.id, reseller.id, 'expired', tomorrow); // Expired status - not counted
    await createTestLicenseKey(game.id, reseller.id, 'active', pastDate); // Already past but still active

    const stats = await getDashboardStats();

    expect(stats.expiring_keys_3_days).toEqual(3); // Tomorrow, in2Days, and pastDate (still active but expired)
  });

  it('should return comprehensive dashboard statistics', async () => {
    // Setup comprehensive test data
    const reseller1 = await createTestUser('reseller', 100);
    const reseller2 = await createTestUser('reseller', 50);
    const developer = await createTestUser('developer', null);
    const game = await createTestGame();

    // Create various license keys
    const activeKey1 = await createTestLicenseKey(game.id, reseller1.id, 'active');
    const activeKey2 = await createTestLicenseKey(game.id, reseller2.id, 'active');
    await createTestLicenseKey(game.id, reseller1.id, 'expired');
    await createTestLicenseKey(game.id, reseller2.id, 'suspended');

    // Create activity logs for today
    const today = new Date();
    await createTestActivityLog(activeKey1.id, 'login', today);
    await createTestActivityLog(activeKey2.id, 'login', today);

    // Create expiring key
    const expiringDate = new Date(today);
    expiringDate.setDate(expiringDate.getDate() + 2);
    await createTestLicenseKey(game.id, reseller1.id, 'active', expiringDate);

    const stats = await getDashboardStats();

    expect(stats.total_resellers).toEqual(2);
    expect(stats.total_active_keys).toEqual(3);
    expect(stats.total_expired_keys).toEqual(1);
    expect(stats.total_logins_today).toEqual(2);
    expect(stats.expiring_keys_3_days).toEqual(1);
  });
});

describe('getResellerStats', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should throw error for non-existent reseller', async () => {
    await expect(getResellerStats(999)).rejects.toThrow(/reseller not found/i);
  });

  it('should return zero stats for reseller with no keys', async () => {
    const reseller = await createTestUser('reseller', 100);

    const stats = await getResellerStats(reseller.id);

    expect(stats.total_keys).toEqual(0);
    expect(stats.active_keys).toEqual(0);
    expect(stats.expired_keys).toEqual(0);
    expect(stats.quota_used).toEqual(0);
    expect(stats.quota_remaining).toEqual(100);
  });

  it('should calculate stats correctly for reseller with keys', async () => {
    const reseller = await createTestUser('reseller', 10);
    const game = await createTestGame();

    // Create various keys for this reseller
    await createTestLicenseKey(game.id, reseller.id, 'active');
    await createTestLicenseKey(game.id, reseller.id, 'active');
    await createTestLicenseKey(game.id, reseller.id, 'active');
    await createTestLicenseKey(game.id, reseller.id, 'expired');
    await createTestLicenseKey(game.id, reseller.id, 'expired');
    await createTestLicenseKey(game.id, reseller.id, 'suspended');
    await createTestLicenseKey(game.id, reseller.id, 'pending');

    const stats = await getResellerStats(reseller.id);

    expect(stats.total_keys).toEqual(7);
    expect(stats.active_keys).toEqual(3);
    expect(stats.expired_keys).toEqual(2);
    expect(stats.quota_used).toEqual(7);
    expect(stats.quota_remaining).toEqual(3); // 10 - 7 = 3
  });

  it('should handle reseller with null quota', async () => {
    const reseller = await createTestUser('reseller', null);
    const game = await createTestGame();

    await createTestLicenseKey(game.id, reseller.id, 'active');
    await createTestLicenseKey(game.id, reseller.id, 'expired');

    const stats = await getResellerStats(reseller.id);

    expect(stats.total_keys).toEqual(2);
    expect(stats.active_keys).toEqual(1);
    expect(stats.expired_keys).toEqual(1);
    expect(stats.quota_used).toEqual(2);
    expect(stats.quota_remaining).toEqual(0); // null quota treated as 0
  });

  it('should not count keys created by other resellers', async () => {
    const reseller1 = await createTestUser('reseller', 50);
    const reseller2 = await createTestUser('reseller', 50);
    const game = await createTestGame();

    // Create keys for both resellers
    await createTestLicenseKey(game.id, reseller1.id, 'active');
    await createTestLicenseKey(game.id, reseller1.id, 'expired');
    await createTestLicenseKey(game.id, reseller2.id, 'active');
    await createTestLicenseKey(game.id, reseller2.id, 'active');

    const stats1 = await getResellerStats(reseller1.id);
    const stats2 = await getResellerStats(reseller2.id);

    expect(stats1.total_keys).toEqual(2);
    expect(stats1.active_keys).toEqual(1);
    expect(stats1.expired_keys).toEqual(1);

    expect(stats2.total_keys).toEqual(2);
    expect(stats2.active_keys).toEqual(2);
    expect(stats2.expired_keys).toEqual(0);
  });

  it('should handle quota remaining correctly when over quota', async () => {
    const reseller = await createTestUser('reseller', 3);
    const game = await createTestGame();

    // Create more keys than quota allows
    await createTestLicenseKey(game.id, reseller.id, 'active');
    await createTestLicenseKey(game.id, reseller.id, 'active');
    await createTestLicenseKey(game.id, reseller.id, 'active');
    await createTestLicenseKey(game.id, reseller.id, 'active');
    await createTestLicenseKey(game.id, reseller.id, 'expired');

    const stats = await getResellerStats(reseller.id);

    expect(stats.total_keys).toEqual(5);
    expect(stats.quota_used).toEqual(5);
    expect(stats.quota_remaining).toEqual(0); // Should not be negative
  });
});