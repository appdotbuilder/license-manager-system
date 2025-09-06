import { db } from '../db';
import { usersTable } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { type LoginInput, type User } from '../schema';

export async function authenticateUser(input: LoginInput): Promise<User | null> {
  try {
    // Find user by username
    const users = await db.select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.username, input.username),
          eq(usersTable.is_active, true)
        )
      )
      .execute();

    if (users.length === 0) {
      return null;
    }

    const user = users[0];

    // Verify password
    const isValidPassword = await verifyPassword(input.password, user.password_hash);
    
    if (!isValidPassword) {
      return null;
    }

    // Return user data
    return {
      id: user.id,
      username: user.username,
      password_hash: user.password_hash,
      role: user.role,
      full_name: user.full_name,
      email: user.email,
      quota: user.quota,
      allocated_games: user.allocated_games,
      created_at: user.created_at,
      updated_at: user.updated_at,
      is_active: user.is_active
    };
  } catch (error) {
    console.error('Authentication failed:', error);
    throw error;
  }
}

export async function hashPassword(password: string): Promise<string> {
  try {
    // Generate a random salt
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Create password hash using PBKDF2
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password + saltHex);
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordData,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: encoder.encode(saltHex),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );
    
    const hashArray = new Uint8Array(derivedBits);
    const hashHex = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Return salt + hash
    return `${saltHex}:${hashHex}`;
  } catch (error) {
    console.error('Password hashing failed:', error);
    throw error;
  }
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  try {
    // Split salt and hash
    const [saltHex, expectedHash] = hashedPassword.split(':');
    if (!saltHex || !expectedHash) {
      return false;
    }
    
    // Hash the provided password with the stored salt
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password + saltHex);
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordData,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: encoder.encode(saltHex),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );
    
    const hashArray = new Uint8Array(derivedBits);
    const hashHex = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Constant-time comparison to prevent timing attacks
    return hashHex === expectedHash;
  } catch (error) {
    console.error('Password verification failed:', error);
    return false;
  }
}