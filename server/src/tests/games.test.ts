import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { gamesTable } from '../db/schema';
import { type CreateGameInput, type UpdateGameInput } from '../schema';
import { 
    createGame, 
    updateGame, 
    getGameById, 
    getGames, 
    deleteGame 
} from '../handlers/games';
import { eq } from 'drizzle-orm';

// Test input data
const testGameInput: CreateGameInput = {
    name: 'Test Game',
    description: 'A test game for unit testing',
    version: '1.0.0'
};

const minimalGameInput: CreateGameInput = {
    name: 'Minimal Game',
    description: null,
    version: null
};

describe('Games Handlers', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    describe('createGame', () => {
        it('should create a game with all fields', async () => {
            const result = await createGame(testGameInput);

            expect(result.name).toEqual('Test Game');
            expect(result.description).toEqual('A test game for unit testing');
            expect(result.version).toEqual('1.0.0');
            expect(result.is_active).toBe(true);
            expect(result.id).toBeDefined();
            expect(result.created_at).toBeInstanceOf(Date);
        });

        it('should create a game with minimal fields', async () => {
            const result = await createGame(minimalGameInput);

            expect(result.name).toEqual('Minimal Game');
            expect(result.description).toBe(null);
            expect(result.version).toBe(null);
            expect(result.is_active).toBe(true);
            expect(result.id).toBeDefined();
            expect(result.created_at).toBeInstanceOf(Date);
        });

        it('should save game to database', async () => {
            const result = await createGame(testGameInput);

            const games = await db.select()
                .from(gamesTable)
                .where(eq(gamesTable.id, result.id))
                .execute();

            expect(games).toHaveLength(1);
            expect(games[0].name).toEqual('Test Game');
            expect(games[0].description).toEqual('A test game for unit testing');
            expect(games[0].version).toEqual('1.0.0');
            expect(games[0].is_active).toBe(true);
            expect(games[0].created_at).toBeInstanceOf(Date);
        });

        it('should allow multiple games with same name', async () => {
            const game1 = await createGame(testGameInput);
            const game2 = await createGame(testGameInput);

            expect(game1.id).not.toEqual(game2.id);
            expect(game1.name).toEqual(game2.name);
        });
    });

    describe('updateGame', () => {
        it('should update all fields of an existing game', async () => {
            const game = await createGame(testGameInput);

            const updateInput: UpdateGameInput = {
                id: game.id,
                name: 'Updated Game Name',
                description: 'Updated description',
                version: '2.0.0',
                is_active: false
            };

            const result = await updateGame(updateInput);

            expect(result.id).toEqual(game.id);
            expect(result.name).toEqual('Updated Game Name');
            expect(result.description).toEqual('Updated description');
            expect(result.version).toEqual('2.0.0');
            expect(result.is_active).toBe(false);
            expect(result.created_at).toEqual(game.created_at);
        });

        it('should update only specified fields', async () => {
            const game = await createGame(testGameInput);

            const updateInput: UpdateGameInput = {
                id: game.id,
                name: 'Updated Name Only'
            };

            const result = await updateGame(updateInput);

            expect(result.name).toEqual('Updated Name Only');
            expect(result.description).toEqual(testGameInput.description);
            expect(result.version).toEqual(testGameInput.version);
            expect(result.is_active).toBe(true);
        });

        it('should handle null values correctly', async () => {
            const game = await createGame(testGameInput);

            const updateInput: UpdateGameInput = {
                id: game.id,
                description: null,
                version: null
            };

            const result = await updateGame(updateInput);

            expect(result.description).toBe(null);
            expect(result.version).toBe(null);
            expect(result.name).toEqual(testGameInput.name);
        });

        it('should throw error for non-existent game', async () => {
            const updateInput: UpdateGameInput = {
                id: 99999,
                name: 'Non-existent Game'
            };

            await expect(updateGame(updateInput)).rejects.toThrow(/not found/i);
        });

        it('should update game in database', async () => {
            const game = await createGame(testGameInput);

            const updateInput: UpdateGameInput = {
                id: game.id,
                name: 'Database Updated Name',
                is_active: false
            };

            await updateGame(updateInput);

            const updatedGames = await db.select()
                .from(gamesTable)
                .where(eq(gamesTable.id, game.id))
                .execute();

            expect(updatedGames).toHaveLength(1);
            expect(updatedGames[0].name).toEqual('Database Updated Name');
            expect(updatedGames[0].is_active).toBe(false);
        });
    });

    describe('getGameById', () => {
        it('should return game when found', async () => {
            const createdGame = await createGame(testGameInput);

            const result = await getGameById(createdGame.id);

            expect(result).not.toBe(null);
            expect(result!.id).toEqual(createdGame.id);
            expect(result!.name).toEqual('Test Game');
            expect(result!.description).toEqual('A test game for unit testing');
            expect(result!.version).toEqual('1.0.0');
            expect(result!.is_active).toBe(true);
        });

        it('should return null when game not found', async () => {
            const result = await getGameById(99999);

            expect(result).toBe(null);
        });

        it('should return inactive games', async () => {
            const game = await createGame(testGameInput);
            await deleteGame(game.id); // This sets is_active to false

            const result = await getGameById(game.id);

            expect(result).not.toBe(null);
            expect(result!.is_active).toBe(false);
        });
    });

    describe('getGames', () => {
        beforeEach(async () => {
            // Create test games
            await createGame({ name: 'Active Game 1', description: 'Active game', version: '1.0' });
            await createGame({ name: 'Active Game 2', description: 'Another active game', version: '1.1' });
            
            const inactiveGame = await createGame({ name: 'Inactive Game', description: 'Will be inactive', version: '1.0' });
            await deleteGame(inactiveGame.id); // Make it inactive
        });

        it('should return all games when activeOnly is false', async () => {
            const result = await getGames(false);

            expect(result).toHaveLength(3);
            
            const activeGames = result.filter(game => game.is_active);
            const inactiveGames = result.filter(game => !game.is_active);
            
            expect(activeGames).toHaveLength(2);
            expect(inactiveGames).toHaveLength(1);
        });

        it('should return only active games when activeOnly is true', async () => {
            const result = await getGames(true);

            expect(result).toHaveLength(2);
            expect(result.every(game => game.is_active)).toBe(true);
            
            const gameNames = result.map(game => game.name);
            expect(gameNames).toContain('Active Game 1');
            expect(gameNames).toContain('Active Game 2');
            expect(gameNames).not.toContain('Inactive Game');
        });

        it('should return all games by default', async () => {
            const result = await getGames();

            expect(result).toHaveLength(3);
        });

        it('should return empty array when no games exist', async () => {
            // Clear all games
            await db.delete(gamesTable).execute();

            const result = await getGames();

            expect(result).toHaveLength(0);
        });
    });

    describe('deleteGame', () => {
        it('should soft delete an existing game', async () => {
            const game = await createGame(testGameInput);

            const result = await deleteGame(game.id);

            expect(result).toBe(true);

            // Verify game is marked as inactive
            const deletedGame = await getGameById(game.id);
            expect(deletedGame).not.toBe(null);
            expect(deletedGame!.is_active).toBe(false);
        });

        it('should return false for non-existent game', async () => {
            const result = await deleteGame(99999);

            expect(result).toBe(false);
        });

        it('should update game in database', async () => {
            const game = await createGame(testGameInput);

            await deleteGame(game.id);

            const games = await db.select()
                .from(gamesTable)
                .where(eq(gamesTable.id, game.id))
                .execute();

            expect(games).toHaveLength(1);
            expect(games[0].is_active).toBe(false);
        });

        it('should handle already deleted game', async () => {
            const game = await createGame(testGameInput);
            
            // Delete once
            const firstDelete = await deleteGame(game.id);
            expect(firstDelete).toBe(true);

            // Delete again
            const secondDelete = await deleteGame(game.id);
            expect(secondDelete).toBe(true); // Should still return true as the game exists
        });
    });

    describe('Integration scenarios', () => {
        it('should handle complete game lifecycle', async () => {
            // Create game
            const game = await createGame(testGameInput);
            expect(game.is_active).toBe(true);

            // Update game
            const updatedGame = await updateGame({
                id: game.id,
                name: 'Updated Game',
                version: '2.0.0'
            });
            expect(updatedGame.name).toEqual('Updated Game');
            expect(updatedGame.version).toEqual('2.0.0');

            // Get game
            const fetchedGame = await getGameById(game.id);
            expect(fetchedGame!.name).toEqual('Updated Game');

            // Verify in games list
            const allGames = await getGames();
            const activeGames = await getGames(true);
            expect(allGames.some(g => g.id === game.id)).toBe(true);
            expect(activeGames.some(g => g.id === game.id)).toBe(true);

            // Soft delete game
            const deleted = await deleteGame(game.id);
            expect(deleted).toBe(true);

            // Verify deletion
            const deletedGame = await getGameById(game.id);
            expect(deletedGame!.is_active).toBe(false);

            const activeGamesAfterDelete = await getGames(true);
            expect(activeGamesAfterDelete.some(g => g.id === game.id)).toBe(false);
        });

        it('should handle edge cases correctly', async () => {
            // Test empty string name
            const gameWithEmptyDesc = await createGame({
                name: 'Game with Empty Description',
                description: '',
                version: ''
            });
            expect(gameWithEmptyDesc.description).toEqual('');
            expect(gameWithEmptyDesc.version).toEqual('');

            // Test long strings within limits
            const longName = 'A'.repeat(100); // Max length for name
            const longVersion = 'B'.repeat(20); // Max length for version
            const gameWithLongStrings = await createGame({
                name: longName,
                description: 'Long description test',
                version: longVersion
            });
            expect(gameWithLongStrings.name).toEqual(longName);
            expect(gameWithLongStrings.version).toEqual(longVersion);
        });
    });
});