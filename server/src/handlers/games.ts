import { db } from '../db';
import { gamesTable } from '../db/schema';
import { 
    type CreateGameInput, 
    type UpdateGameInput, 
    type Game 
} from '../schema';
import { eq } from 'drizzle-orm';

export async function createGame(input: CreateGameInput): Promise<Game> {
    try {
        const result = await db.insert(gamesTable)
            .values({
                name: input.name,
                description: input.description,
                version: input.version
            })
            .returning()
            .execute();

        return result[0];
    } catch (error) {
        console.error('Game creation failed:', error);
        throw error;
    }
}

export async function updateGame(input: UpdateGameInput): Promise<Game> {
    try {
        const updateData: Partial<typeof gamesTable.$inferInsert> = {};
        
        if (input.name !== undefined) updateData.name = input.name;
        if (input.description !== undefined) updateData.description = input.description;
        if (input.version !== undefined) updateData.version = input.version;
        if (input.is_active !== undefined) updateData.is_active = input.is_active;

        const result = await db.update(gamesTable)
            .set(updateData)
            .where(eq(gamesTable.id, input.id))
            .returning()
            .execute();

        if (result.length === 0) {
            throw new Error(`Game with id ${input.id} not found`);
        }

        return result[0];
    } catch (error) {
        console.error('Game update failed:', error);
        throw error;
    }
}

export async function getGameById(id: number): Promise<Game | null> {
    try {
        const result = await db.select()
            .from(gamesTable)
            .where(eq(gamesTable.id, id))
            .execute();

        return result.length > 0 ? result[0] : null;
    } catch (error) {
        console.error('Get game by ID failed:', error);
        throw error;
    }
}

export async function getGames(activeOnly: boolean = false): Promise<Game[]> {
    try {
        if (activeOnly) {
            const results = await db.select()
                .from(gamesTable)
                .where(eq(gamesTable.is_active, true))
                .execute();
            return results;
        } else {
            const results = await db.select()
                .from(gamesTable)
                .execute();
            return results;
        }
    } catch (error) {
        console.error('Get games failed:', error);
        throw error;
    }
}

export async function deleteGame(id: number): Promise<boolean> {
    try {
        const result = await db.update(gamesTable)
            .set({ 
                is_active: false
            })
            .where(eq(gamesTable.id, id))
            .returning()
            .execute();

        return result.length > 0;
    } catch (error) {
        console.error('Game deletion failed:', error);
        throw error;
    }
}