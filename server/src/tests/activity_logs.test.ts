import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, gamesTable, licenseKeysTable, activityLogsTable } from '../db/schema';
import { type CreateActivityLogInput } from '../schema';
import { 
    createActivityLog, 
    getActivityLogs, 
    getTodayLoginCount, 
    getRecentActivity 
} from '../handlers/activity_logs';
import { eq, desc } from 'drizzle-orm';

// Test data setup
const testUser = {
    username: 'test_user',
    password_hash: 'hashed_password',
    role: 'developer' as const,
    full_name: 'Test User',
    email: 'test@example.com',
    quota: null,
    allocated_games: null,
    is_active: true
};

const testGame = {
    name: 'Test Game',
    description: 'A test game',
    version: '1.0',
    is_active: true
};

const testLicenseKey = {
    key: 'TEST-KEY-12345',
    customer_name: 'Test Customer',
    customer_email: 'customer@example.com',
    device_id: null,
    status: 'active' as const,
    expires_at: new Date(Date.now() + 86400000), // 1 day from now
    notes: 'Test license'
};

describe('Activity Logs Handlers', () => {
    let userId: number;
    let gameId: number;
    let licenseKeyId: number;

    beforeEach(async () => {
        await createDB();

        // Create test user
        const userResult = await db.insert(usersTable)
            .values(testUser)
            .returning()
            .execute();
        userId = userResult[0].id;

        // Create test game
        const gameResult = await db.insert(gamesTable)
            .values(testGame)
            .returning()
            .execute();
        gameId = gameResult[0].id;

        // Create test license key
        const licenseResult = await db.insert(licenseKeysTable)
            .values({
                ...testLicenseKey,
                game_id: gameId,
                created_by: userId
            })
            .returning()
            .execute();
        licenseKeyId = licenseResult[0].id;
    });

    afterEach(resetDB);

    describe('createActivityLog', () => {
        const testInput: CreateActivityLogInput = {
            license_key_id: 0, // Will be set in tests
            device_id: 'device-123',
            action: 'login',
            ip_address: '192.168.1.100',
            user_agent: 'Test User Agent'
        };

        it('should create an activity log', async () => {
            const input = { ...testInput, license_key_id: licenseKeyId };
            const result = await createActivityLog(input);

            // Verify basic fields
            expect(result.license_key_id).toBe(licenseKeyId);
            expect(result.device_id).toBe('device-123');
            expect(result.action).toBe('login');
            expect(result.ip_address).toBe('192.168.1.100');
            expect(result.user_agent).toBe('Test User Agent');
            expect(result.id).toBeDefined();
            expect(result.created_at).toBeInstanceOf(Date);
        });

        it('should save activity log to database', async () => {
            const input = { ...testInput, license_key_id: licenseKeyId };
            const result = await createActivityLog(input);

            // Verify in database
            const saved = await db.select()
                .from(activityLogsTable)
                .where(eq(activityLogsTable.id, result.id))
                .execute();

            expect(saved).toHaveLength(1);
            expect(saved[0].license_key_id).toBe(licenseKeyId);
            expect(saved[0].device_id).toBe('device-123');
            expect(saved[0].action).toBe('login');
            expect(saved[0].ip_address).toBe('192.168.1.100');
            expect(saved[0].user_agent).toBe('Test User Agent');
        });

        it('should create activity log with nullable fields', async () => {
            const input: CreateActivityLogInput = {
                license_key_id: licenseKeyId,
                device_id: 'device-456',
                action: 'device_lock',
                ip_address: null,
                user_agent: null
            };

            const result = await createActivityLog(input);

            expect(result.license_key_id).toBe(licenseKeyId);
            expect(result.device_id).toBe('device-456');
            expect(result.action).toBe('device_lock');
            expect(result.ip_address).toBeNull();
            expect(result.user_agent).toBeNull();
        });

        it('should fail with invalid license key id', async () => {
            const input = { ...testInput, license_key_id: 99999 };

            await expect(createActivityLog(input)).rejects.toThrow(/violates foreign key constraint/i);
        });
    });

    describe('getActivityLogs', () => {
        beforeEach(async () => {
            // Create multiple activity logs
            const logs = [
                {
                    license_key_id: licenseKeyId,
                    device_id: 'device-1',
                    action: 'login',
                    ip_address: '192.168.1.1',
                    user_agent: 'Agent 1'
                },
                {
                    license_key_id: licenseKeyId,
                    device_id: 'device-2',
                    action: 'device_lock',
                    ip_address: '192.168.1.2',
                    user_agent: 'Agent 2'
                },
                {
                    license_key_id: licenseKeyId,
                    device_id: 'device-3',
                    action: 'key_reset',
                    ip_address: '192.168.1.3',
                    user_agent: 'Agent 3'
                }
            ];

            await db.insert(activityLogsTable)
                .values(logs)
                .execute();
        });

        it('should get all activity logs without filter', async () => {
            const result = await getActivityLogs();

            expect(result.length).toBe(3);
            // Should be ordered by created_at desc
            expect(result[0].created_at >= result[1].created_at).toBe(true);
            expect(result[1].created_at >= result[2].created_at).toBe(true);
        });

        it('should get activity logs for specific license key', async () => {
            const result = await getActivityLogs(licenseKeyId);

            expect(result.length).toBe(3);
            result.forEach(log => {
                expect(log.license_key_id).toBe(licenseKeyId);
            });
        });

        it('should respect limit parameter', async () => {
            const result = await getActivityLogs(undefined, 2);

            expect(result.length).toBe(2);
        });

        it('should return empty array for non-existent license key', async () => {
            const result = await getActivityLogs(99999);

            expect(result.length).toBe(0);
        });

        it('should return logs in descending order by created_at', async () => {
            const result = await getActivityLogs(licenseKeyId);

            for (let i = 0; i < result.length - 1; i++) {
                expect(result[i].created_at >= result[i + 1].created_at).toBe(true);
            }
        });
    });

    describe('getTodayLoginCount', () => {
        beforeEach(async () => {
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            // Create logs for today and yesterday
            const logs = [
                // Today's logins
                {
                    license_key_id: licenseKeyId,
                    device_id: 'device-1',
                    action: 'login',
                    ip_address: '192.168.1.1',
                    user_agent: 'Agent 1'
                },
                {
                    license_key_id: licenseKeyId,
                    device_id: 'device-2',
                    action: 'login',
                    ip_address: '192.168.1.2',
                    user_agent: 'Agent 2'
                },
                // Today's non-login action
                {
                    license_key_id: licenseKeyId,
                    device_id: 'device-3',
                    action: 'device_lock',
                    ip_address: '192.168.1.3',
                    user_agent: 'Agent 3'
                }
            ];

            await db.insert(activityLogsTable)
                .values(logs)
                .execute();

            // Insert a yesterday's login (simulate by updating timestamp)
            const yesterdayLog = await db.insert(activityLogsTable)
                .values({
                    license_key_id: licenseKeyId,
                    device_id: 'device-old',
                    action: 'login',
                    ip_address: '192.168.1.100',
                    user_agent: 'Old Agent'
                })
                .returning()
                .execute();

            // Update timestamp to yesterday
            await db.update(activityLogsTable)
                .set({ created_at: yesterday })
                .where(eq(activityLogsTable.id, yesterdayLog[0].id))
                .execute();
        });

        it('should count only today\'s login actions', async () => {
            const count = await getTodayLoginCount();

            expect(count).toBe(2);
        });

        it('should return 0 when no logins today', async () => {
            // Delete today's login logs
            await db.delete(activityLogsTable)
                .where(eq(activityLogsTable.action, 'login'))
                .execute();

            const count = await getTodayLoginCount();

            expect(count).toBe(0);
        });
    });

    describe('getRecentActivity', () => {
        beforeEach(async () => {
            // Create multiple activity logs with different timestamps
            const logs = [];
            for (let i = 0; i < 60; i++) {
                logs.push({
                    license_key_id: licenseKeyId,
                    device_id: `device-${i}`,
                    action: i % 3 === 0 ? 'login' : i % 3 === 1 ? 'device_lock' : 'key_reset',
                    ip_address: `192.168.1.${i}`,
                    user_agent: `Agent ${i}`
                });
            }

            await db.insert(activityLogsTable)
                .values(logs)
                .execute();
        });

        it('should get recent activity with default limit', async () => {
            const result = await getRecentActivity();

            expect(result.length).toBe(50); // Default limit
        });

        it('should respect custom limit', async () => {
            const result = await getRecentActivity(30);

            expect(result.length).toBe(30);
        });

        it('should return all logs when limit exceeds total', async () => {
            const result = await getRecentActivity(100);

            expect(result.length).toBe(60); // Total logs created
        });

        it('should return logs in descending order by created_at', async () => {
            const result = await getRecentActivity(10);

            for (let i = 0; i < result.length - 1; i++) {
                expect(result[i].created_at >= result[i + 1].created_at).toBe(true);
            }
        });

        it('should return empty array when no logs exist', async () => {
            await db.delete(activityLogsTable).execute();

            const result = await getRecentActivity();

            expect(result.length).toBe(0);
        });
    });
});