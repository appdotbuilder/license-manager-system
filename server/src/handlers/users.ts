import { db } from '../db';
import { usersTable } from '../db/schema';
import { 
    type CreateUserInput, 
    type UpdateUserInput, 
    type User,
    type UserRole 
} from '../schema';
import { eq } from 'drizzle-orm';

// Simple password hashing using Bun's built-in crypto
const hashPassword = async (password: string): Promise<string> => {
  return await Bun.password.hash(password);
};

export async function createUser(input: CreateUserInput): Promise<User> {
  try {
    // Check if username already exists
    const existingUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.username, input.username))
      .execute();

    if (existingUser.length > 0) {
      throw new Error('Username already exists');
    }

    // Hash the password
    const password_hash = await hashPassword(input.password);

    // Insert the new user
    const result = await db.insert(usersTable)
      .values({
        username: input.username,
        password_hash,
        role: input.role,
        full_name: input.full_name,
        email: input.email,
        quota: input.quota,
        allocated_games: input.allocated_games,
        is_active: true
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('User creation failed:', error);
    throw error;
  }
}

export async function updateUser(input: UpdateUserInput): Promise<User> {
  try {
    // Check if user exists
    const existingUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.id))
      .execute();

    if (existingUser.length === 0) {
      throw new Error('User not found');
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date()
    };

    if (input.username !== undefined) {
      // Check if new username is already taken by another user
      const otherUserCheck = await db.select()
        .from(usersTable)
        .where(eq(usersTable.username, input.username))
        .execute();

      // If we found a user with this username, make sure it's the current user
      if (otherUserCheck.length > 0 && otherUserCheck[0].id !== input.id) {
        throw new Error('Username already exists');
      }

      updateData.username = input.username;
    }

    if (input.password !== undefined) {
      updateData.password_hash = await hashPassword(input.password);
    }

    if (input.full_name !== undefined) {
      updateData.full_name = input.full_name;
    }

    if (input.email !== undefined) {
      updateData.email = input.email;
    }

    if (input.quota !== undefined) {
      updateData.quota = input.quota;
    }

    if (input.allocated_games !== undefined) {
      updateData.allocated_games = input.allocated_games;
    }

    if (input.is_active !== undefined) {
      updateData.is_active = input.is_active;
    }

    // Update the user
    const result = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('User update failed:', error);
    throw error;
  }
}

export async function getUserById(id: number): Promise<User | null> {
  try {
    const result = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('User retrieval failed:', error);
    throw error;
  }
}

export async function getUsers(role?: UserRole): Promise<User[]> {
  try {
    if (role !== undefined) {
      const result = await db.select()
        .from(usersTable)
        .where(eq(usersTable.role, role))
        .execute();
      return result;
    } else {
      const result = await db.select()
        .from(usersTable)
        .execute();
      return result;
    }
  } catch (error) {
    console.error('Users retrieval failed:', error);
    throw error;
  }
}

export async function deleteUser(id: number): Promise<boolean> {
  try {
    // Check if user exists
    const existingUser = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .execute();

    if (existingUser.length === 0) {
      return false;
    }

    // Soft delete by setting is_active to false
    await db.update(usersTable)
      .set({ 
        is_active: false,
        updated_at: new Date()
      })
      .where(eq(usersTable.id, id))
      .execute();

    return true;
  } catch (error) {
    console.error('User deletion failed:', error);
    throw error;
  }
}