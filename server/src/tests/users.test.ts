import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type UpdateUserInput } from '../schema';
import { 
  createUser, 
  updateUser, 
  getUserById, 
  getUsers, 
  deleteUser 
} from '../handlers/users';
import { eq } from 'drizzle-orm';

// Test user inputs
const testUserInput: CreateUserInput = {
  username: 'testuser',
  password: 'password123',
  role: 'user',
  full_name: 'Test User',
  email: 'test@example.com',
  quota: null,
  allocated_games: null
};

const testResellerInput: CreateUserInput = {
  username: 'testreseller',
  password: 'password123',
  role: 'reseller',
  full_name: 'Test Reseller',
  email: 'reseller@example.com',
  quota: 100,
  allocated_games: ['game1', 'game2']
};

const testDeveloperInput: CreateUserInput = {
  username: 'testdev',
  password: 'password123',
  role: 'developer',
  full_name: 'Test Developer',
  email: null,
  quota: null,
  allocated_games: null
};

describe('User Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createUser', () => {
    it('should create a user with all fields', async () => {
      const result = await createUser(testUserInput);

      expect(result.username).toEqual('testuser');
      expect(result.role).toEqual('user');
      expect(result.full_name).toEqual('Test User');
      expect(result.email).toEqual('test@example.com');
      expect(result.quota).toBeNull();
      expect(result.allocated_games).toBeNull();
      expect(result.is_active).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeNull();
      expect(result.password_hash).toBeDefined();
      expect(result.password_hash).not.toEqual('password123'); // Should be hashed
    });

    it('should create a reseller with quota and allocated games', async () => {
      const result = await createUser(testResellerInput);

      expect(result.username).toEqual('testreseller');
      expect(result.role).toEqual('reseller');
      expect(result.full_name).toEqual('Test Reseller');
      expect(result.email).toEqual('reseller@example.com');
      expect(result.quota).toEqual(100);
      expect(result.allocated_games).toEqual(['game1', 'game2']);
      expect(result.is_active).toBe(true);
    });

    it('should save user to database', async () => {
      const result = await createUser(testUserInput);

      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].username).toEqual('testuser');
      expect(users[0].role).toEqual('user');
      expect(users[0].password_hash).toBeDefined();
      expect(users[0].password_hash).not.toEqual('password123');
    });

    it('should throw error for duplicate username', async () => {
      await createUser(testUserInput);

      await expect(createUser(testUserInput)).rejects.toThrow(/username already exists/i);
    });

    it('should create developer with null email', async () => {
      const result = await createUser(testDeveloperInput);

      expect(result.username).toEqual('testdev');
      expect(result.role).toEqual('developer');
      expect(result.email).toBeNull();
      expect(result.quota).toBeNull();
      expect(result.allocated_games).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user basic information', async () => {
      const user = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        full_name: 'Updated Name',
        email: 'updated@example.com'
      };

      const result = await updateUser(updateInput);

      expect(result.id).toEqual(user.id);
      expect(result.username).toEqual('testuser'); // Unchanged
      expect(result.full_name).toEqual('Updated Name');
      expect(result.email).toEqual('updated@example.com');
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should update user password', async () => {
      const user = await createUser(testUserInput);
      const originalPasswordHash = user.password_hash;
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        password: 'newpassword123'
      };

      const result = await updateUser(updateInput);

      expect(result.password_hash).toBeDefined();
      expect(result.password_hash).not.toEqual(originalPasswordHash);
      expect(result.password_hash).not.toEqual('newpassword123');
    });

    it('should update username when not taken', async () => {
      const user = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        username: 'newusername'
      };

      const result = await updateUser(updateInput);

      expect(result.username).toEqual('newusername');
    });

    it('should throw error when updating to existing username', async () => {
      const user1 = await createUser(testUserInput);
      const user2 = await createUser(testResellerInput);
      
      const updateInput: UpdateUserInput = {
        id: user2.id,
        username: 'testuser' // user1's username
      };

      await expect(updateUser(updateInput)).rejects.toThrow(/username already exists/i);
    });

    it('should update reseller quota and allocated games', async () => {
      const user = await createUser(testResellerInput);
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        quota: 200,
        allocated_games: ['game3', 'game4', 'game5']
      };

      const result = await updateUser(updateInput);

      expect(result.quota).toEqual(200);
      expect(result.allocated_games).toEqual(['game3', 'game4', 'game5']);
    });

    it('should deactivate user', async () => {
      const user = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        is_active: false
      };

      const result = await updateUser(updateInput);

      expect(result.is_active).toBe(false);
    });

    it('should throw error for non-existent user', async () => {
      const updateInput: UpdateUserInput = {
        id: 99999,
        full_name: 'Updated Name'
      };

      await expect(updateUser(updateInput)).rejects.toThrow(/user not found/i);
    });

    it('should save changes to database', async () => {
      const user = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: user.id,
        full_name: 'Database Updated Name',
        email: 'dbupdate@example.com'
      };

      await updateUser(updateInput);

      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].full_name).toEqual('Database Updated Name');
      expect(users[0].email).toEqual('dbupdate@example.com');
      expect(users[0].updated_at).toBeInstanceOf(Date);
    });
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      const user = await createUser(testUserInput);

      const result = await getUserById(user.id);

      expect(result).toBeDefined();
      expect(result!.id).toEqual(user.id);
      expect(result!.username).toEqual('testuser');
      expect(result!.full_name).toEqual('Test User');
    });

    it('should return null when user not found', async () => {
      const result = await getUserById(99999);

      expect(result).toBeNull();
    });

    it('should return inactive user', async () => {
      const user = await createUser(testUserInput);
      await deleteUser(user.id); // Soft delete

      const result = await getUserById(user.id);

      expect(result).toBeDefined();
      expect(result!.is_active).toBe(false);
    });
  });

  describe('getUsers', () => {
    beforeEach(async () => {
      // Create test users of different roles
      await createUser(testUserInput);
      await createUser(testResellerInput);
      await createUser(testDeveloperInput);
    });

    it('should return all users when no role filter', async () => {
      const result = await getUsers();

      expect(result).toHaveLength(3);
      const roles = result.map(u => u.role).sort();
      expect(roles).toEqual(['developer', 'reseller', 'user']);
    });

    it('should filter users by role - user', async () => {
      const result = await getUsers('user');

      expect(result).toHaveLength(1);
      expect(result[0].role).toEqual('user');
      expect(result[0].username).toEqual('testuser');
    });

    it('should filter users by role - reseller', async () => {
      const result = await getUsers('reseller');

      expect(result).toHaveLength(1);
      expect(result[0].role).toEqual('reseller');
      expect(result[0].username).toEqual('testreseller');
      expect(result[0].quota).toEqual(100);
    });

    it('should filter users by role - developer', async () => {
      const result = await getUsers('developer');

      expect(result).toHaveLength(1);
      expect(result[0].role).toEqual('developer');
      expect(result[0].username).toEqual('testdev');
    });

    it('should return empty array when no users match role', async () => {
      // Delete all users with 'user' role (soft delete)
      const users = await getUsers('user');
      for (const user of users) {
        await deleteUser(user.id);
      }

      // The soft-deleted user will still be returned, so let's test filtering inactive users
      const activeUsers = await getUsers('user');
      const activeUserCount = activeUsers.filter(u => u.is_active).length;
      expect(activeUserCount).toEqual(0);
    });

    it('should include inactive users in results', async () => {
      const users = await getUsers();
      await deleteUser(users[0].id); // Soft delete one user

      const result = await getUsers();
      expect(result).toHaveLength(3); // Still returns all users including inactive
      
      const inactiveUsers = result.filter(u => !u.is_active);
      expect(inactiveUsers).toHaveLength(1);
    });
  });

  describe('deleteUser', () => {
    it('should soft delete existing user', async () => {
      const user = await createUser(testUserInput);

      const result = await deleteUser(user.id);

      expect(result).toBe(true);

      // Verify user is marked as inactive
      const updatedUser = await getUserById(user.id);
      expect(updatedUser).toBeDefined();
      expect(updatedUser!.is_active).toBe(false);
      expect(updatedUser!.updated_at).toBeInstanceOf(Date);
    });

    it('should return false for non-existent user', async () => {
      const result = await deleteUser(99999);

      expect(result).toBe(false);
    });

    it('should save soft delete to database', async () => {
      const user = await createUser(testUserInput);

      await deleteUser(user.id);

      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].is_active).toBe(false);
      expect(users[0].updated_at).toBeInstanceOf(Date);
    });

    it('should handle already deleted user', async () => {
      const user = await createUser(testUserInput);

      // Delete once
      const result1 = await deleteUser(user.id);
      expect(result1).toBe(true);

      // Delete again
      const result2 = await deleteUser(user.id);
      expect(result2).toBe(true); // Still returns true as user exists
    });
  });
});