import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, gamesTable, licenseKeysTable, activityLogsTable } from '../db/schema';
import { 
  type CreateLicenseKeyInput,
  type BulkCreateLicenseKeysInput,
  type UpdateLicenseKeyInput,
  type SearchLicenseKeysInput,
  type ActivateLicenseInput,
  type ResetDeviceLockInput
} from '../schema';
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
} from '../handlers/license_keys';
import { eq, and, gte, lte } from 'drizzle-orm';

// Test data setup
let testUserId: number;
let testGameId: number;

const createTestUser = async () => {
  const result = await db.insert(usersTable)
    .values({
      username: 'test_user',
      password_hash: 'hashed_password',
      role: 'developer',
      full_name: 'Test User',
      email: 'test@example.com',
      is_active: true
    })
    .returning()
    .execute();
  return result[0].id;
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
  return result[0].id;
};

describe('License Keys Handlers', () => {
  beforeEach(async () => {
    await createDB();
    testUserId = await createTestUser();
    testGameId = await createTestGame();
  });

  afterEach(resetDB);

  describe('createLicenseKey', () => {
    const testInput: CreateLicenseKeyInput = {
      game_id: 0, // Will be set in tests
      customer_name: 'Test Customer',
      customer_email: 'customer@example.com',
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      notes: 'Test license key',
      created_by: 0 // Will be set in tests
    };

    it('should create a license key successfully', async () => {
      const input = { ...testInput, game_id: testGameId, created_by: testUserId };
      
      const result = await createLicenseKey(input);

      expect(result.id).toBeDefined();
      expect(result.key).toBeDefined();
      expect(result.key).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(result.game_id).toEqual(testGameId);
      expect(result.customer_name).toEqual('Test Customer');
      expect(result.customer_email).toEqual('customer@example.com');
      expect(result.device_id).toBeNull();
      expect(result.status).toEqual('active');
      expect(result.expires_at).toBeInstanceOf(Date);
      expect(result.notes).toEqual('Test license key');
      expect(result.created_by).toEqual(testUserId);
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeNull();
      expect(result.last_used_at).toBeNull();
    });

    it('should save license key to database', async () => {
      const input = { ...testInput, game_id: testGameId, created_by: testUserId };
      
      const result = await createLicenseKey(input);

      const savedKey = await db.select()
        .from(licenseKeysTable)
        .where(eq(licenseKeysTable.id, result.id))
        .execute();

      expect(savedKey).toHaveLength(1);
      expect(savedKey[0].key).toEqual(result.key);
      expect(savedKey[0].customer_name).toEqual('Test Customer');
    });

    it('should generate unique license keys', async () => {
      const input = { ...testInput, game_id: testGameId, created_by: testUserId };
      
      const result1 = await createLicenseKey(input);
      const result2 = await createLicenseKey(input);

      expect(result1.key).not.toEqual(result2.key);
    });

    it('should throw error for non-existent game', async () => {
      const input = { ...testInput, game_id: 99999, created_by: testUserId };
      
      await expect(createLicenseKey(input)).rejects.toThrow(/game not found/i);
    });

    it('should throw error for non-existent user', async () => {
      const input = { ...testInput, game_id: testGameId, created_by: 99999 };
      
      await expect(createLicenseKey(input)).rejects.toThrow(/creator user not found/i);
    });
  });

  describe('bulkCreateLicenseKeys', () => {
    const testInput: BulkCreateLicenseKeysInput = {
      game_id: 0, // Will be set in tests
      customer_names: ['Customer 1', 'Customer 2', 'Customer 3'],
      customer_emails: ['customer1@example.com', 'customer2@example.com', null],
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      notes: 'Bulk test keys',
      created_by: 0 // Will be set in tests
    };

    it('should create multiple license keys', async () => {
      const input = { ...testInput, game_id: testGameId, created_by: testUserId };
      
      const results = await bulkCreateLicenseKeys(input);

      expect(results).toHaveLength(3);
      
      results.forEach((result, index) => {
        expect(result.id).toBeDefined();
        expect(result.key).toBeDefined();
        expect(result.key).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
        expect(result.customer_name).toEqual(input.customer_names[index]);
        expect(result.customer_email).toEqual(input.customer_emails?.[index] || null);
        expect(result.game_id).toEqual(testGameId);
        expect(result.created_by).toEqual(testUserId);
      });

      // Check all keys are unique
      const keys = results.map(r => r.key);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toEqual(keys.length);
    });

    it('should save all keys to database', async () => {
      const input = { ...testInput, game_id: testGameId, created_by: testUserId };
      
      const results = await bulkCreateLicenseKeys(input);

      const savedKeys = await db.select()
        .from(licenseKeysTable)
        .where(eq(licenseKeysTable.created_by, testUserId))
        .execute();

      expect(savedKeys).toHaveLength(3);
    });

    it('should throw error for non-existent game', async () => {
      const input = { ...testInput, game_id: 99999, created_by: testUserId };
      
      await expect(bulkCreateLicenseKeys(input)).rejects.toThrow(/game not found/i);
    });
  });

  describe('updateLicenseKey', () => {
    let testLicenseKeyId: number;

    beforeEach(async () => {
      const input: CreateLicenseKeyInput = {
        game_id: testGameId,
        customer_name: 'Original Customer',
        customer_email: 'original@example.com',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        notes: 'Original notes',
        created_by: testUserId
      };
      
      const created = await createLicenseKey(input);
      testLicenseKeyId = created.id;
    });

    it('should update license key fields', async () => {
      const updateInput: UpdateLicenseKeyInput = {
        id: testLicenseKeyId,
        customer_name: 'Updated Customer',
        customer_email: 'updated@example.com',
        status: 'suspended',
        notes: 'Updated notes'
      };

      const result = await updateLicenseKey(updateInput);

      expect(result.customer_name).toEqual('Updated Customer');
      expect(result.customer_email).toEqual('updated@example.com');
      expect(result.status).toEqual('suspended');
      expect(result.notes).toEqual('Updated notes');
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save updated fields to database', async () => {
      const updateInput: UpdateLicenseKeyInput = {
        id: testLicenseKeyId,
        customer_name: 'Updated Customer'
      };

      await updateLicenseKey(updateInput);

      const saved = await db.select()
        .from(licenseKeysTable)
        .where(eq(licenseKeysTable.id, testLicenseKeyId))
        .execute();

      expect(saved[0].customer_name).toEqual('Updated Customer');
      expect(saved[0].updated_at).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent license key', async () => {
      const updateInput: UpdateLicenseKeyInput = {
        id: 99999,
        customer_name: 'Updated Customer'
      };

      await expect(updateLicenseKey(updateInput)).rejects.toThrow(/license key not found/i);
    });
  });

  describe('searchLicenseKeys', () => {
    beforeEach(async () => {
      // Create test license keys with different attributes
      await createLicenseKey({
        game_id: testGameId,
        customer_name: 'John Doe',
        customer_email: 'john@example.com',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        notes: 'Active key',
        created_by: testUserId
      });

      await createLicenseKey({
        game_id: testGameId,
        customer_name: 'Jane Smith',
        customer_email: 'jane@example.com',
        expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        notes: 'Another key',
        created_by: testUserId
      });
    });

    it('should search without filters', async () => {
      const input: SearchLicenseKeysInput = {
        page: 1,
        limit: 20
      };

      const result = await searchLicenseKeys(input);

      expect(result.keys).toHaveLength(2);
      expect(result.total).toEqual(2);
      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(20);
    });

    it('should filter by customer name', async () => {
      const input: SearchLicenseKeysInput = {
        customer_name: 'John',
        page: 1,
        limit: 20
      };

      const result = await searchLicenseKeys(input);

      expect(result.keys).toHaveLength(1);
      expect(result.keys[0].customer_name).toEqual('John Doe');
    });

    it('should filter by game_id', async () => {
      const input: SearchLicenseKeysInput = {
        game_id: testGameId,
        page: 1,
        limit: 20
      };

      const result = await searchLicenseKeys(input);

      expect(result.keys).toHaveLength(2);
      result.keys.forEach(key => {
        expect(key.game_id).toEqual(testGameId);
      });
    });

    it('should handle pagination', async () => {
      const input: SearchLicenseKeysInput = {
        page: 1,
        limit: 1
      };

      const result = await searchLicenseKeys(input);

      expect(result.keys).toHaveLength(1);
      expect(result.total).toEqual(2);
      expect(result.page).toEqual(1);
      expect(result.limit).toEqual(1);
    });
  });

  describe('getLicenseKeyById', () => {
    let testLicenseKeyId: number;

    beforeEach(async () => {
      const created = await createLicenseKey({
        game_id: testGameId,
        customer_name: 'Test Customer',
        customer_email: 'test@example.com',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        notes: 'Test key',
        created_by: testUserId
      });
      testLicenseKeyId = created.id;
    });

    it('should return license key by ID', async () => {
      const result = await getLicenseKeyById(testLicenseKeyId);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(testLicenseKeyId);
      expect(result!.customer_name).toEqual('Test Customer');
    });

    it('should return null for non-existent ID', async () => {
      const result = await getLicenseKeyById(99999);
      expect(result).toBeNull();
    });
  });

  describe('getLicenseKeyByKey', () => {
    let testLicenseKey: string;

    beforeEach(async () => {
      const created = await createLicenseKey({
        game_id: testGameId,
        customer_name: 'Test Customer',
        customer_email: 'test@example.com',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        notes: 'Test key',
        created_by: testUserId
      });
      testLicenseKey = created.key;
    });

    it('should return license key by key string', async () => {
      const result = await getLicenseKeyByKey(testLicenseKey);

      expect(result).not.toBeNull();
      expect(result!.key).toEqual(testLicenseKey);
      expect(result!.customer_name).toEqual('Test Customer');
    });

    it('should return null for non-existent key', async () => {
      const result = await getLicenseKeyByKey('NON-EXIS-TENT-KEY1');
      expect(result).toBeNull();
    });
  });

  describe('activateLicenseKey', () => {
    let testLicenseKey: string;
    let testLicenseKeyId: number;

    beforeEach(async () => {
      const created = await createLicenseKey({
        game_id: testGameId,
        customer_name: 'Test Customer',
        customer_email: 'test@example.com',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        notes: 'Test key',
        created_by: testUserId
      });
      testLicenseKey = created.key;
      testLicenseKeyId = created.id;
    });

    it('should activate license key successfully', async () => {
      const input: ActivateLicenseInput = {
        license_key: testLicenseKey,
        device_id: 'test-device-123'
      };

      const result = await activateLicenseKey(input);

      expect(result.license_key).toEqual(testLicenseKey);
      expect(result.game_name).toEqual('Test Game');
      expect(result.customer_name).toEqual('Test Customer');
      expect(result.device_id).toEqual('test-device-123');
      expect(result.status).toEqual('active');
      expect(result.days_until_expiry).toBeGreaterThan(25);
      expect(result.is_expiring_soon).toBe(false);
    });

    it('should update device_id and last_used_at in database', async () => {
      const input: ActivateLicenseInput = {
        license_key: testLicenseKey,
        device_id: 'test-device-123'
      };

      await activateLicenseKey(input);

      const updated = await db.select()
        .from(licenseKeysTable)
        .where(eq(licenseKeysTable.id, testLicenseKeyId))
        .execute();

      expect(updated[0].device_id).toEqual('test-device-123');
      expect(updated[0].last_used_at).toBeInstanceOf(Date);
      expect(updated[0].updated_at).toBeInstanceOf(Date);
    });

    it('should create activity log entry', async () => {
      const input: ActivateLicenseInput = {
        license_key: testLicenseKey,
        device_id: 'test-device-123'
      };

      await activateLicenseKey(input);

      const activities = await db.select()
        .from(activityLogsTable)
        .where(eq(activityLogsTable.license_key_id, testLicenseKeyId))
        .execute();

      expect(activities).toHaveLength(1);
      expect(activities[0].device_id).toEqual('test-device-123');
      expect(activities[0].action).toEqual('activation');
    });

    it('should allow reactivation with same device', async () => {
      const input: ActivateLicenseInput = {
        license_key: testLicenseKey,
        device_id: 'test-device-123'
      };

      // First activation
      await activateLicenseKey(input);
      
      // Second activation with same device should work
      const result = await activateLicenseKey(input);
      expect(result.device_id).toEqual('test-device-123');
    });

    it('should reject activation with different device', async () => {
      const input1: ActivateLicenseInput = {
        license_key: testLicenseKey,
        device_id: 'test-device-123'
      };

      const input2: ActivateLicenseInput = {
        license_key: testLicenseKey,
        device_id: 'different-device-456'
      };

      await activateLicenseKey(input1);
      
      await expect(activateLicenseKey(input2)).rejects.toThrow(/locked to a different device/i);
    });

    it('should reject expired license key', async () => {
      // Create expired key
      const expired = await createLicenseKey({
        game_id: testGameId,
        customer_name: 'Expired Customer',
        customer_email: 'expired@example.com',
        expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
        notes: 'Expired key',
        created_by: testUserId
      });

      const input: ActivateLicenseInput = {
        license_key: expired.key,
        device_id: 'test-device-123'
      };

      await expect(activateLicenseKey(input)).rejects.toThrow(/expired/i);
    });

    it('should reject non-existent license key', async () => {
      const input: ActivateLicenseInput = {
        license_key: 'NON-EXIS-TENT-KEY1',
        device_id: 'test-device-123'
      };

      await expect(activateLicenseKey(input)).rejects.toThrow(/not found/i);
    });
  });

  describe('resetDeviceLock', () => {
    let testLicenseKeyId: number;

    beforeEach(async () => {
      const created = await createLicenseKey({
        game_id: testGameId,
        customer_name: 'Test Customer',
        customer_email: 'test@example.com',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        notes: 'Test key',
        created_by: testUserId
      });
      testLicenseKeyId = created.id;

      // Set device lock
      await db.update(licenseKeysTable)
        .set({ device_id: 'locked-device-123' })
        .where(eq(licenseKeysTable.id, testLicenseKeyId))
        .execute();
    });

    it('should reset device lock successfully', async () => {
      const input: ResetDeviceLockInput = {
        license_key_id: testLicenseKeyId,
        admin_user_id: testUserId
      };

      const result = await resetDeviceLock(input);
      expect(result).toBe(true);
    });

    it('should clear device_id in database', async () => {
      const input: ResetDeviceLockInput = {
        license_key_id: testLicenseKeyId,
        admin_user_id: testUserId
      };

      await resetDeviceLock(input);

      const updated = await db.select()
        .from(licenseKeysTable)
        .where(eq(licenseKeysTable.id, testLicenseKeyId))
        .execute();

      expect(updated[0].device_id).toBeNull();
      expect(updated[0].updated_at).toBeInstanceOf(Date);
    });

    it('should create activity log entry', async () => {
      const input: ResetDeviceLockInput = {
        license_key_id: testLicenseKeyId,
        admin_user_id: testUserId
      };

      await resetDeviceLock(input);

      const activities = await db.select()
        .from(activityLogsTable)
        .where(eq(activityLogsTable.license_key_id, testLicenseKeyId))
        .execute();

      expect(activities).toHaveLength(1);
      expect(activities[0].device_id).toEqual('admin_reset');
      expect(activities[0].action).toEqual('device_reset');
    });

    it('should throw error for non-existent license key', async () => {
      const input: ResetDeviceLockInput = {
        license_key_id: 99999,
        admin_user_id: testUserId
      };

      await expect(resetDeviceLock(input)).rejects.toThrow(/license key not found/i);
    });
  });

  describe('getExpiringKeys', () => {
    beforeEach(async () => {
      const now = new Date();
      
      // Create key expiring in 2 days
      await createLicenseKey({
        game_id: testGameId,
        customer_name: 'Expiring Soon',
        customer_email: 'expiring@example.com',
        expires_at: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
        notes: 'Expiring soon',
        created_by: testUserId
      });

      // Create key expiring in 10 days
      await createLicenseKey({
        game_id: testGameId,
        customer_name: 'Not Expiring Soon',
        customer_email: 'not_expiring@example.com',
        expires_at: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
        notes: 'Not expiring soon',
        created_by: testUserId
      });

      // Create already expired key
      await createLicenseKey({
        game_id: testGameId,
        customer_name: 'Already Expired',
        customer_email: 'expired@example.com',
        expires_at: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        notes: 'Already expired',
        created_by: testUserId
      });
    });

    it('should return keys expiring within default 3 days', async () => {
      const result = await getExpiringKeys();

      expect(result).toHaveLength(1);
      expect(result[0].customer_name).toEqual('Expiring Soon');
    });

    it('should return keys expiring within specified days', async () => {
      const result = await getExpiringKeys(15);

      expect(result).toHaveLength(2); // Both non-expired keys
      expect(result.some(k => k.customer_name === 'Expiring Soon')).toBe(true);
      expect(result.some(k => k.customer_name === 'Not Expiring Soon')).toBe(true);
    });

    it('should exclude expired keys', async () => {
      const result = await getExpiringKeys(15);

      expect(result.every(k => k.customer_name !== 'Already Expired')).toBe(true);
    });

    it('should order by expiration date', async () => {
      const result = await getExpiringKeys(15);

      expect(result).toHaveLength(2);
      expect(result[0].customer_name).toEqual('Expiring Soon');
      expect(result[1].customer_name).toEqual('Not Expiring Soon');
    });
  });
});