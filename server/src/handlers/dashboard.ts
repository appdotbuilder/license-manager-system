import { db } from '../db';
import { usersTable, licenseKeysTable, activityLogsTable } from '../db/schema';
import { type DashboardStats } from '../schema';
import { eq, gte, and, count, sql } from 'drizzle-orm';

export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    // Get current date for date-based queries
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    threeDaysFromNow.setHours(23, 59, 59, 999);

    // Count total resellers (users with role 'reseller')
    const resellerCountResult = await db.select({ 
      count: count() 
    })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.role, 'reseller'),
        eq(usersTable.is_active, true)
      )
    )
    .execute();

    // Count active license keys
    const activeKeysResult = await db.select({ 
      count: count() 
    })
    .from(licenseKeysTable)
    .where(eq(licenseKeysTable.status, 'active'))
    .execute();

    // Count expired license keys
    const expiredKeysResult = await db.select({ 
      count: count() 
    })
    .from(licenseKeysTable)
    .where(eq(licenseKeysTable.status, 'expired'))
    .execute();

    // Count today's logins from activity logs
    const todayLoginsResult = await db.select({ 
      count: count() 
    })
    .from(activityLogsTable)
    .where(
      and(
        eq(activityLogsTable.action, 'login'),
        gte(activityLogsTable.created_at, today)
      )
    )
    .execute();

    // Count keys expiring in the next 3 days (active keys only)
    const expiringKeysResult = await db.select({ 
      count: count() 
    })
    .from(licenseKeysTable)
    .where(
      and(
        eq(licenseKeysTable.status, 'active'),
        sql`${licenseKeysTable.expires_at} <= ${threeDaysFromNow}`
      )
    )
    .execute();

    return {
      total_resellers: resellerCountResult[0].count,
      total_active_keys: activeKeysResult[0].count,
      total_expired_keys: expiredKeysResult[0].count,
      total_logins_today: todayLoginsResult[0].count,
      expiring_keys_3_days: expiringKeysResult[0].count
    };
  } catch (error) {
    console.error('Dashboard stats retrieval failed:', error);
    throw error;
  }
}

export async function getResellerStats(resellerId: number): Promise<{
  total_keys: number;
  active_keys: number;
  expired_keys: number;
  quota_used: number;
  quota_remaining: number;
}> {
  try {
    // Get reseller information to check quota
    const resellerResult = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, resellerId))
      .execute();

    if (resellerResult.length === 0) {
      throw new Error('Reseller not found');
    }

    const reseller = resellerResult[0];
    const quota = reseller.quota || 0;

    // Count total keys created by this reseller
    const totalKeysResult = await db.select({ 
      count: count() 
    })
    .from(licenseKeysTable)
    .where(eq(licenseKeysTable.created_by, resellerId))
    .execute();

    // Count active keys created by this reseller
    const activeKeysResult = await db.select({ 
      count: count() 
    })
    .from(licenseKeysTable)
    .where(
      and(
        eq(licenseKeysTable.created_by, resellerId),
        eq(licenseKeysTable.status, 'active')
      )
    )
    .execute();

    // Count expired keys created by this reseller
    const expiredKeysResult = await db.select({ 
      count: count() 
    })
    .from(licenseKeysTable)
    .where(
      and(
        eq(licenseKeysTable.created_by, resellerId),
        eq(licenseKeysTable.status, 'expired')
      )
    )
    .execute();

    const totalKeys = totalKeysResult[0].count;
    const activeKeys = activeKeysResult[0].count;
    const expiredKeys = expiredKeysResult[0].count;
    const quotaUsed = totalKeys;
    const quotaRemaining = Math.max(0, quota - quotaUsed);

    return {
      total_keys: totalKeys,
      active_keys: activeKeys,
      expired_keys: expiredKeys,
      quota_used: quotaUsed,
      quota_remaining: quotaRemaining
    };
  } catch (error) {
    console.error('Reseller stats retrieval failed:', error);
    throw error;
  }
}