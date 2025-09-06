import { db } from '../db';
import { 
  licenseKeysTable, 
  gamesTable, 
  usersTable,
  activityLogsTable 
} from '../db/schema';
import { 
  type CreateLicenseKeyInput, 
  type BulkCreateLicenseKeysInput,
  type UpdateLicenseKeyInput, 
  type SearchLicenseKeysInput,
  type ActivateLicenseInput,
  type ResetDeviceLockInput,
  type LicenseKey,
  type LicenseDetails
} from '../schema';
import { eq, and, or, ilike, lte, gte, count, desc, SQL } from 'drizzle-orm';

export async function createLicenseKey(input: CreateLicenseKeyInput): Promise<LicenseKey> {
  try {
    // Validate that game exists
    const gameExists = await db.select({ id: gamesTable.id })
      .from(gamesTable)
      .where(eq(gamesTable.id, input.game_id))
      .execute();

    if (gameExists.length === 0) {
      throw new Error('Game not found');
    }

    // Validate that creator exists
    const userExists = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, input.created_by))
      .execute();

    if (userExists.length === 0) {
      throw new Error('Creator user not found');
    }

    // Generate unique license key
    let generatedKey: string;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      generatedKey = generateLicenseKeyString();
      const existing = await db.select({ id: licenseKeysTable.id })
        .from(licenseKeysTable)
        .where(eq(licenseKeysTable.key, generatedKey))
        .execute();
      
      isUnique = existing.length === 0;
      attempts++;
    } while (!isUnique && attempts < maxAttempts);

    if (!isUnique) {
      throw new Error('Failed to generate unique license key');
    }

    // Insert license key
    const result = await db.insert(licenseKeysTable)
      .values({
        key: generatedKey,
        game_id: input.game_id,
        customer_name: input.customer_name,
        customer_email: input.customer_email,
        expires_at: input.expires_at,
        notes: input.notes,
        created_by: input.created_by,
        status: 'active'
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('License key creation failed:', error);
    throw error;
  }
}

export async function bulkCreateLicenseKeys(input: BulkCreateLicenseKeysInput): Promise<LicenseKey[]> {
  try {
    // Validate that game exists
    const gameExists = await db.select({ id: gamesTable.id })
      .from(gamesTable)
      .where(eq(gamesTable.id, input.game_id))
      .execute();

    if (gameExists.length === 0) {
      throw new Error('Game not found');
    }

    // Validate that creator exists
    const userExists = await db.select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, input.created_by))
      .execute();

    if (userExists.length === 0) {
      throw new Error('Creator user not found');
    }

    // Generate unique keys for all customers
    const keyData = [];
    for (let i = 0; i < input.customer_names.length; i++) {
      let generatedKey: string;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;

      do {
        generatedKey = generateLicenseKeyString();
        const existing = await db.select({ id: licenseKeysTable.id })
          .from(licenseKeysTable)
          .where(eq(licenseKeysTable.key, generatedKey))
          .execute();
        
        isUnique = existing.length === 0 && !keyData.some(k => k.key === generatedKey);
        attempts++;
      } while (!isUnique && attempts < maxAttempts);

      if (!isUnique) {
        throw new Error(`Failed to generate unique license key for customer ${input.customer_names[i]}`);
      }

      keyData.push({
        key: generatedKey,
        game_id: input.game_id,
        customer_name: input.customer_names[i],
        customer_email: input.customer_emails?.[i] || null,
        expires_at: input.expires_at,
        notes: input.notes,
        created_by: input.created_by,
        status: 'active' as const
      });
    }

    // Bulk insert all keys
    const results = await db.insert(licenseKeysTable)
      .values(keyData)
      .returning()
      .execute();

    return results;
  } catch (error) {
    console.error('Bulk license key creation failed:', error);
    throw error;
  }
}

export async function updateLicenseKey(input: UpdateLicenseKeyInput): Promise<LicenseKey> {
  try {
    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date()
    };

    if (input.customer_name !== undefined) {
      updateData.customer_name = input.customer_name;
    }
    if (input.customer_email !== undefined) {
      updateData.customer_email = input.customer_email;
    }
    if (input.status !== undefined) {
      updateData.status = input.status;
    }
    if (input.expires_at !== undefined) {
      updateData.expires_at = input.expires_at;
    }
    if (input.notes !== undefined) {
      updateData.notes = input.notes;
    }

    const result = await db.update(licenseKeysTable)
      .set(updateData)
      .where(eq(licenseKeysTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('License key not found');
    }

    return result[0];
  } catch (error) {
    console.error('License key update failed:', error);
    throw error;
  }
}

export async function searchLicenseKeys(input: SearchLicenseKeysInput): Promise<{
  keys: LicenseKey[];
  total: number;
  page: number;
  limit: number;
}> {
  try {
    // Build conditions array
    const conditions: SQL<unknown>[] = [];

    if (input.game_id !== undefined) {
      conditions.push(eq(licenseKeysTable.game_id, input.game_id));
    }

    if (input.customer_name !== undefined) {
      conditions.push(ilike(licenseKeysTable.customer_name, `%${input.customer_name}%`));
    }

    if (input.status !== undefined) {
      conditions.push(eq(licenseKeysTable.status, input.status));
    }

    if (input.license_key !== undefined) {
      conditions.push(ilike(licenseKeysTable.key, `%${input.license_key}%`));
    }

    if (input.created_by !== undefined) {
      conditions.push(eq(licenseKeysTable.created_by, input.created_by));
    }

    // Get total count
    const totalResult = await db.select({ count: count() })
      .from(licenseKeysTable)
      .where(conditions.length === 0 ? undefined : 
        conditions.length === 1 ? conditions[0] : and(...conditions))
      .execute();
    const total = totalResult[0].count;

    // Get paginated results
    const offset = (input.page - 1) * input.limit;
    const keys = await db.select()
      .from(licenseKeysTable)
      .where(conditions.length === 0 ? undefined : 
        conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(licenseKeysTable.created_at))
      .limit(input.limit)
      .offset(offset)
      .execute();

    return {
      keys,
      total,
      page: input.page,
      limit: input.limit
    };
  } catch (error) {
    console.error('License key search failed:', error);
    throw error;
  }
}

export async function getLicenseKeyById(id: number): Promise<LicenseKey | null> {
  try {
    const result = await db.select()
      .from(licenseKeysTable)
      .where(eq(licenseKeysTable.id, id))
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('License key fetch by ID failed:', error);
    throw error;
  }
}

export async function getLicenseKeyByKey(key: string): Promise<LicenseKey | null> {
  try {
    const result = await db.select()
      .from(licenseKeysTable)
      .where(eq(licenseKeysTable.key, key))
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('License key fetch by key failed:', error);
    throw error;
  }
}

export async function activateLicenseKey(input: ActivateLicenseInput): Promise<LicenseDetails> {
  try {
    // Get license key with game information
    const result = await db.select({
      license_key: licenseKeysTable.key,
      id: licenseKeysTable.id,
      customer_name: licenseKeysTable.customer_name,
      device_id: licenseKeysTable.device_id,
      expires_at: licenseKeysTable.expires_at,
      status: licenseKeysTable.status,
      notes: licenseKeysTable.notes,
      game_name: gamesTable.name
    })
      .from(licenseKeysTable)
      .innerJoin(gamesTable, eq(licenseKeysTable.game_id, gamesTable.id))
      .where(eq(licenseKeysTable.key, input.license_key))
      .execute();

    if (result.length === 0) {
      throw new Error('License key not found');
    }

    const licenseData = result[0];

    // Check if key is expired
    const now = new Date();
    if (licenseData.expires_at < now) {
      throw new Error('License key has expired');
    }

    // Check if key is suspended
    if (licenseData.status === 'suspended') {
      throw new Error('License key is suspended');
    }

    // Check device lock - if device_id exists and doesn't match, deny activation
    if (licenseData.device_id && licenseData.device_id !== input.device_id) {
      throw new Error('License key is locked to a different device');
    }

    // Update license key with device info and last used timestamp
    await db.update(licenseKeysTable)
      .set({
        device_id: input.device_id,
        last_used_at: now,
        updated_at: now
      })
      .where(eq(licenseKeysTable.id, licenseData.id))
      .execute();

    // Log activation activity
    await db.insert(activityLogsTable)
      .values({
        license_key_id: licenseData.id,
        device_id: input.device_id,
        action: 'activation',
        created_at: now
      })
      .execute();

    // Calculate days until expiry
    const msUntilExpiry = licenseData.expires_at.getTime() - now.getTime();
    const daysUntilExpiry = Math.ceil(msUntilExpiry / (1000 * 60 * 60 * 24));

    return {
      license_key: licenseData.license_key,
      game_name: licenseData.game_name,
      customer_name: licenseData.customer_name,
      device_id: input.device_id,
      expires_at: licenseData.expires_at,
      status: licenseData.status,
      notes: licenseData.notes,
      days_until_expiry: daysUntilExpiry,
      is_expiring_soon: daysUntilExpiry <= 3
    };
  } catch (error) {
    console.error('License key activation failed:', error);
    throw error;
  }
}

export async function resetDeviceLock(input: ResetDeviceLockInput): Promise<boolean> {
  try {
    // Check if license key exists
    const licenseKey = await getLicenseKeyById(input.license_key_id);
    if (!licenseKey) {
      throw new Error('License key not found');
    }

    // Reset device lock
    await db.update(licenseKeysTable)
      .set({
        device_id: null,
        updated_at: new Date()
      })
      .where(eq(licenseKeysTable.id, input.license_key_id))
      .execute();

    // Log the reset action
    await db.insert(activityLogsTable)
      .values({
        license_key_id: input.license_key_id,
        device_id: 'admin_reset',
        action: 'device_reset',
        created_at: new Date()
      })
      .execute();

    return true;
  } catch (error) {
    console.error('Device lock reset failed:', error);
    throw error;
  }
}

export async function getExpiringKeys(daysAhead: number = 3): Promise<LicenseKey[]> {
  try {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const result = await db.select()
      .from(licenseKeysTable)
      .where(
        and(
          eq(licenseKeysTable.status, 'active'),
          gte(licenseKeysTable.expires_at, now),
          lte(licenseKeysTable.expires_at, futureDate)
        )
      )
      .orderBy(licenseKeysTable.expires_at)
      .execute();

    return result;
  } catch (error) {
    console.error('Expiring keys fetch failed:', error);
    throw error;
  }
}

function generateLicenseKeyString(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segments = [];
  
  for (let i = 0; i < 4; i++) {
    let segment = '';
    for (let j = 0; j < 4; j++) {
      segment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    segments.push(segment);
  }
  
  return segments.join('-');
}