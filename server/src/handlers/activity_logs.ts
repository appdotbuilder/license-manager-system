import { db } from '../db';
import { activityLogsTable } from '../db/schema';
import { 
    type CreateActivityLogInput, 
    type ActivityLog 
} from '../schema';
import { eq, desc, gte, and, count } from 'drizzle-orm';

export async function createActivityLog(input: CreateActivityLogInput): Promise<ActivityLog> {
    try {
        // Insert activity log record
        const result = await db.insert(activityLogsTable)
            .values({
                license_key_id: input.license_key_id,
                device_id: input.device_id,
                action: input.action,
                ip_address: input.ip_address,
                user_agent: input.user_agent
            })
            .returning()
            .execute();

        return result[0];
    } catch (error) {
        console.error('Activity log creation failed:', error);
        throw error;
    }
}

export async function getActivityLogs(
    licenseKeyId?: number,
    limit: number = 100
): Promise<ActivityLog[]> {
    try {
        // Build query with conditional where clause
        if (licenseKeyId !== undefined) {
            const results = await db.select()
                .from(activityLogsTable)
                .where(eq(activityLogsTable.license_key_id, licenseKeyId))
                .orderBy(desc(activityLogsTable.created_at))
                .limit(limit)
                .execute();
            return results;
        } else {
            const results = await db.select()
                .from(activityLogsTable)
                .orderBy(desc(activityLogsTable.created_at))
                .limit(limit)
                .execute();
            return results;
        }
    } catch (error) {
        console.error('Failed to fetch activity logs:', error);
        throw error;
    }
}

export async function getTodayLoginCount(): Promise<number> {
    try {
        // Get start of today in UTC
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        // Count login actions for today
        const result = await db.select({ count: count() })
            .from(activityLogsTable)
            .where(
                and(
                    eq(activityLogsTable.action, 'login'),
                    gte(activityLogsTable.created_at, today)
                )
            )
            .execute();

        return result[0]?.count || 0;
    } catch (error) {
        console.error('Failed to get today login count:', error);
        throw error;
    }
}

export async function getRecentActivity(limit: number = 50): Promise<ActivityLog[]> {
    try {
        // Get recent activity logs ordered by creation time
        const results = await db.select()
            .from(activityLogsTable)
            .orderBy(desc(activityLogsTable.created_at))
            .limit(limit)
            .execute();

        return results;
    } catch (error) {
        console.error('Failed to fetch recent activity:', error);
        throw error;
    }
}