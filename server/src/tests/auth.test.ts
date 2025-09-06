import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { type LoginInput, type CreateUserInput } from '../schema';
import { authenticateUser, hashPassword, verifyPassword } from '../handlers/auth';

// Test user data
const testUserData: CreateUserInput = {
  username: 'testuser',
  password: 'testpassword123',
  role: 'developer',
  full_name: 'Test User',
  email: 'test@example.com',
  quota: null,
  allocated_games: null
};

const testLoginInput: LoginInput = {
  username: 'testuser',
  password: 'testpassword123'
};

describe('Auth Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('hashPassword', () => {
    it('should hash password securely', async () => {
      const password = 'testpassword123';
      const hashedPassword = await hashPassword(password);

      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toEqual(password);
      expect(hashedPassword.length).toBeGreaterThan(50); // salt:hash format
      expect(hashedPassword).toContain(':'); // salt:hash separator
    });

    it('should generate different hashes for same password', async () => {
      const password = 'testpassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).not.toEqual(hash2);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'testpassword123';
      const hashedPassword = await hashPassword(password);
      
      const isValid = await verifyPassword(password, hashedPassword);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'testpassword123';
      const wrongPassword = 'wrongpassword';
      const hashedPassword = await hashPassword(password);
      
      const isValid = await verifyPassword(wrongPassword, hashedPassword);
      expect(isValid).toBe(false);
    });

    it('should reject empty password', async () => {
      const password = 'testpassword123';
      const hashedPassword = await hashPassword(password);
      
      const isValid = await verifyPassword('', hashedPassword);
      expect(isValid).toBe(false);
    });
  });

  describe('authenticateUser', () => {
    it('should authenticate valid user credentials', async () => {
      // Create test user in database
      const hashedPassword = await hashPassword(testUserData.password);
      const insertResult = await db.insert(usersTable)
        .values({
          username: testUserData.username,
          password_hash: hashedPassword,
          role: testUserData.role,
          full_name: testUserData.full_name,
          email: testUserData.email,
          quota: testUserData.quota,
          allocated_games: testUserData.allocated_games
        })
        .returning()
        .execute();

      const user = await authenticateUser(testLoginInput);

      expect(user).toBeDefined();
      expect(user?.username).toEqual(testUserData.username);
      expect(user?.role).toEqual(testUserData.role);
      expect(user?.full_name).toEqual(testUserData.full_name);
      expect(user?.email).toEqual(testUserData.email);
      expect(user?.is_active).toBe(true);
      expect(user?.id).toBeDefined();
      expect(user?.created_at).toBeInstanceOf(Date);
    });

    it('should return null for invalid username', async () => {
      const invalidLoginInput: LoginInput = {
        username: 'nonexistentuser',
        password: 'anypassword'
      };

      const user = await authenticateUser(invalidLoginInput);
      expect(user).toBeNull();
    });

    it('should return null for invalid password', async () => {
      // Create test user in database
      const hashedPassword = await hashPassword(testUserData.password);
      await db.insert(usersTable)
        .values({
          username: testUserData.username,
          password_hash: hashedPassword,
          role: testUserData.role,
          full_name: testUserData.full_name,
          email: testUserData.email,
          quota: testUserData.quota,
          allocated_games: testUserData.allocated_games
        })
        .execute();

      const invalidLoginInput: LoginInput = {
        username: testUserData.username,
        password: 'wrongpassword'
      };

      const user = await authenticateUser(invalidLoginInput);
      expect(user).toBeNull();
    });

    it('should return null for inactive user', async () => {
      // Create inactive test user in database
      const hashedPassword = await hashPassword(testUserData.password);
      await db.insert(usersTable)
        .values({
          username: testUserData.username,
          password_hash: hashedPassword,
          role: testUserData.role,
          full_name: testUserData.full_name,
          email: testUserData.email,
          quota: testUserData.quota,
          allocated_games: testUserData.allocated_games,
          is_active: false
        })
        .execute();

      const user = await authenticateUser(testLoginInput);
      expect(user).toBeNull();
    });

    it('should authenticate reseller with quota and allocated games', async () => {
      const resellerData = {
        ...testUserData,
        username: 'reseller_user',
        role: 'reseller' as const,
        quota: 100,
        allocated_games: ['game1', 'game2']
      };

      const resellerLoginInput: LoginInput = {
        username: 'reseller_user',
        password: 'testpassword123'
      };

      // Create reseller user in database
      const hashedPassword = await hashPassword(resellerData.password);
      await db.insert(usersTable)
        .values({
          username: resellerData.username,
          password_hash: hashedPassword,
          role: resellerData.role,
          full_name: resellerData.full_name,
          email: resellerData.email,
          quota: resellerData.quota,
          allocated_games: resellerData.allocated_games
        })
        .execute();

      const user = await authenticateUser(resellerLoginInput);

      expect(user).toBeDefined();
      expect(user?.username).toEqual(resellerData.username);
      expect(user?.role).toEqual('reseller');
      expect(user?.quota).toEqual(100);
      expect(user?.allocated_games).toEqual(['game1', 'game2']);
    });

    it('should authenticate user with null email', async () => {
      const userWithoutEmail = {
        ...testUserData,
        username: 'user_no_email',
        email: null
      };

      const loginInput: LoginInput = {
        username: 'user_no_email',
        password: 'testpassword123'
      };

      // Create user without email in database
      const hashedPassword = await hashPassword(userWithoutEmail.password);
      await db.insert(usersTable)
        .values({
          username: userWithoutEmail.username,
          password_hash: hashedPassword,
          role: userWithoutEmail.role,
          full_name: userWithoutEmail.full_name,
          email: userWithoutEmail.email,
          quota: userWithoutEmail.quota,
          allocated_games: userWithoutEmail.allocated_games
        })
        .execute();

      const user = await authenticateUser(loginInput);

      expect(user).toBeDefined();
      expect(user?.username).toEqual(userWithoutEmail.username);
      expect(user?.email).toBeNull();
    });

    it('should verify user exists in database after authentication', async () => {
      // Create test user in database
      const hashedPassword = await hashPassword(testUserData.password);
      await db.insert(usersTable)
        .values({
          username: testUserData.username,
          password_hash: hashedPassword,
          role: testUserData.role,
          full_name: testUserData.full_name,
          email: testUserData.email,
          quota: testUserData.quota,
          allocated_games: testUserData.allocated_games
        })
        .execute();

      const authenticatedUser = await authenticateUser(testLoginInput);
      expect(authenticatedUser).toBeDefined();

      // Verify the user actually exists in database
      const dbUsers = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, authenticatedUser!.id))
        .execute();

      expect(dbUsers).toHaveLength(1);
      expect(dbUsers[0].username).toEqual(testUserData.username);
      expect(dbUsers[0].is_active).toBe(true);
    });
  });
});