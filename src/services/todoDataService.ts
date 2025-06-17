import { type IAgentRuntime, type UUID, logger } from '@elizaos/core';
import { eq, and, desc, sql, isNull, not, inArray, lt, type SQL } from 'drizzle-orm';
import {
  todosTable,
  todoTagsTable,
  userPointsTable,
  pointHistoryTable,
  dailyStreaksTable,
} from '../schema';

export interface TodoData {
  id: UUID;
  agentId: UUID;
  worldId: UUID;
  roomId: UUID;
  entityId: UUID;
  name: string;
  description?: string | null;
  type: 'daily' | 'one-off' | 'aspirational';
  priority?: number | null;
  isUrgent?: boolean | null;
  isCompleted?: boolean | null;
  dueDate?: Date | null;
  completedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface PointsData {
  entityId: UUID;
  worldId: UUID;
  roomId: UUID;
  currentPoints: number;
  totalPointsEarned: number;
  lastPointUpdateReason?: string | null;
}

export interface StreakData {
  id?: UUID;
  todoId: UUID;
  entityId: UUID;
  currentStreak: number;
  longestStreak: number;
  lastCompletedDate?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Data service for todo-specific database operations
 */
export class TodoDataService {
  private runtime: IAgentRuntime;

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
    if (!runtime.db) {
      throw new Error('Database instance not available on runtime');
    }
  }

  /**
   * Calculates points based on task type and completion status.
   */
  static calculatePoints(
    task: TodoData,
    completionStatus: 'onTime' | 'late' | 'daily' | 'streakBonus'
  ): number {
    let points = 0;
    const priority = task.priority || 4;
    const isUrgent = task.isUrgent || false;

    switch (completionStatus) {
      case 'onTime':
        // Higher points for higher priority (lower number) and urgent tasks
        points = (5 - priority) * 10; // P1=40, P2=30, P3=20, P4=10
        if (isUrgent) {
          points += 10;
        }
        break;
      case 'late':
        points = 5; // Flat small points for late completion
        break;
      case 'daily':
        points = 10; // Standard points for daily tasks
        break;
      case 'streakBonus':
        const streak = typeof task.metadata?.streak === 'number' ? task.metadata.streak : 0;
        points = Math.min(streak * 5, 50); // Bonus points for streak, capped
        break;
    }
    logger.debug(`Calculated points: ${points} for task ${task.name} (${completionStatus})`);
    return points;
  }

  /**
   * Create a new todo
   */
  async createTodo(params: {
    agentId: UUID;
    worldId: UUID;
    roomId: UUID;
    entityId: UUID;
    name: string;
    description?: string;
    type: 'daily' | 'one-off' | 'aspirational';
    priority?: number;
    isUrgent?: boolean;
    dueDate?: Date;
    metadata?: Record<string, any>;
    tags?: string[];
  }): Promise<UUID> {
    try {
      const db = this.runtime.db;

      // Insert the todo
      const [todo] = await db
        .insert(todosTable)
        .values({
          agentId: params.agentId,
          worldId: params.worldId,
          roomId: params.roomId,
          entityId: params.entityId,
          name: params.name,
          description: params.description,
          type: params.type,
          priority: params.priority,
          isUrgent: params.isUrgent,
          dueDate: params.dueDate,
          metadata: params.metadata || {},
        })
        .returning({ id: todosTable.id });

      if (!todo) {
        throw new Error('Failed to create todo');
      }

      // Insert tags if provided
      if (params.tags && params.tags.length > 0) {
        await db.insert(todoTagsTable).values(
          params.tags.map((tag) => ({
            todoId: todo.id,
            tag: tag,
          }))
        );
      }

      // Create streak entry for daily todos
      if (params.type === 'daily') {
        await db.insert(dailyStreaksTable).values({
          todoId: todo.id,
          entityId: params.entityId,
          currentStreak: 0,
          longestStreak: 0,
        });
      }

      return todo.id;
    } catch (error) {
      logger.error('Error creating todo:', error);
      throw error;
    }
  }

  /**
   * Get todos with filters
   */
  async getTodos(params?: {
    entityId?: UUID;
    roomId?: UUID;
    worldId?: UUID;
    agentId?: UUID;
    type?: 'daily' | 'one-off' | 'aspirational';
    isCompleted?: boolean;
    tags?: string[];
    limit?: number;
  }): Promise<TodoData[]> {
    try {
      const db = this.runtime.db;
      const conditions: SQL<unknown>[] = [];

      // Build conditions
      if (params?.entityId) conditions.push(eq(todosTable.entityId, params.entityId));
      if (params?.roomId) conditions.push(eq(todosTable.roomId, params.roomId));
      if (params?.worldId) conditions.push(eq(todosTable.worldId, params.worldId));
      if (params?.agentId) conditions.push(eq(todosTable.agentId, params.agentId));
      if (params?.type) conditions.push(eq(todosTable.type, params.type));
      if (params?.isCompleted !== undefined)
        conditions.push(eq(todosTable.isCompleted, params.isCompleted));

      let query = db.select().from(todosTable);

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      query = query.orderBy(desc(todosTable.createdAt));

      if (params?.limit) {
        query = query.limit(params.limit);
      }

      const todos = await query;

      // Get tags for all todos
      const todoIds = todos.map((t) => t.id);
      if (todoIds.length === 0) {
        return [];
      }

      const tags = await db
        .select()
        .from(todoTagsTable)
        .where(inArray(todoTagsTable.todoId, todoIds));

      // Group tags by todo
      const tagsByTodo = tags.reduce(
        (acc, tag) => {
          if (!acc[tag.todoId]) acc[tag.todoId] = [];
          acc[tag.todoId].push(tag.tag);
          return acc;
        },
        {} as Record<string, string[]>
      );

      // Filter by tags if specified
      let filteredTodos = todos;
      if (params?.tags && params.tags.length > 0) {
        filteredTodos = todos.filter((todo) => {
          const todoTags = tagsByTodo[todo.id] || [];
          return params.tags!.every((tag) => todoTags.includes(tag));
        });
      }

      // Map to TodoData
      return filteredTodos.map((todo) => ({
        ...todo,
        tags: tagsByTodo[todo.id] || [],
      }));
    } catch (error) {
      logger.error('Error getting todos:', error);
      throw error;
    }
  }

  /**
   * Get a single todo by ID
   */
  async getTodo(todoId: UUID): Promise<TodoData | null> {
    try {
      const db = this.runtime.db;

      const [todo] = await db.select().from(todosTable).where(eq(todosTable.id, todoId)).limit(1);

      if (!todo) return null;

      // Get tags
      const tags = await db.select().from(todoTagsTable).where(eq(todoTagsTable.todoId, todoId));

      return {
        ...todo,
        tags: tags.map((t) => t.tag),
      };
    } catch (error) {
      logger.error('Error getting todo:', error);
      throw error;
    }
  }

  /**
   * Update a todo
   */
  async updateTodo(
    todoId: UUID,
    updates: {
      name?: string;
      description?: string;
      priority?: number;
      isUrgent?: boolean;
      isCompleted?: boolean;
      dueDate?: Date | null;
      completedAt?: Date | null;
      metadata?: Record<string, any>;
      tags?: string[];
    }
  ): Promise<boolean> {
    try {
      const db = this.runtime.db;

      // Update todo fields
      const updateData: any = { updatedAt: new Date() };
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.priority !== undefined) updateData.priority = updates.priority;
      if (updates.isUrgent !== undefined) updateData.isUrgent = updates.isUrgent;
      if (updates.isCompleted !== undefined) updateData.isCompleted = updates.isCompleted;
      if (updates.dueDate !== undefined) updateData.dueDate = updates.dueDate;
      if (updates.completedAt !== undefined) updateData.completedAt = updates.completedAt;
      if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

      await db.update(todosTable).set(updateData).where(eq(todosTable.id, todoId));

      // Update tags if provided
      if (updates.tags !== undefined) {
        // Delete existing tags
        await db.delete(todoTagsTable).where(eq(todoTagsTable.todoId, todoId));

        // Insert new tags
        if (updates.tags.length > 0) {
          await db.insert(todoTagsTable).values(
            updates.tags.map((tag) => ({
              todoId: todoId,
              tag: tag,
            }))
          );
        }
      }

      return true;
    } catch (error) {
      logger.error('Error updating todo:', error);
      throw error;
    }
  }

  /**
   * Delete a todo
   */
  async deleteTodo(todoId: UUID): Promise<boolean> {
    try {
      const db = this.runtime.db;

      await db.delete(todosTable).where(eq(todosTable.id, todoId));

      return true;
    } catch (error) {
      logger.error('Error deleting todo:', error);
      throw error;
    }
  }

  /**
   * Get user points
   */
  async getUserPoints(entityId: UUID, worldId: UUID, roomId: UUID): Promise<PointsData | null> {
    try {
      const db = this.runtime.db;

      const [points] = await db
        .select()
        .from(userPointsTable)
        .where(
          and(
            eq(userPointsTable.entityId, entityId),
            eq(userPointsTable.worldId, worldId),
            eq(userPointsTable.roomId, roomId)
          )
        )
        .limit(1);

      return points || null;
    } catch (error) {
      logger.error('Error getting user points:', error);
      throw error;
    }
  }

  /**
   * Add points to a user
   */
  async addUserPoints(
    entityId: UUID,
    worldId: UUID,
    roomId: UUID,
    agentId: UUID,
    pointsToAdd: number,
    reason: string,
    todoId?: UUID
  ): Promise<number> {
    try {
      const db = this.runtime.db;

      // Get or create user points record
      let [userPoints] = await db
        .select()
        .from(userPointsTable)
        .where(
          and(
            eq(userPointsTable.entityId, entityId),
            eq(userPointsTable.worldId, worldId),
            eq(userPointsTable.roomId, roomId)
          )
        )
        .limit(1);

      if (!userPoints) {
        // Create new record
        [userPoints] = await db
          .insert(userPointsTable)
          .values({
            agentId,
            worldId,
            roomId,
            entityId,
            currentPoints: pointsToAdd,
            totalPointsEarned: pointsToAdd,
            lastPointUpdateReason: reason,
          })
          .returning();
      } else {
        // Update existing record
        const newPoints = userPoints.currentPoints + pointsToAdd;
        const newTotal = userPoints.totalPointsEarned + pointsToAdd;

        await db
          .update(userPointsTable)
          .set({
            currentPoints: newPoints,
            totalPointsEarned: newTotal,
            lastPointUpdateReason: reason,
            updatedAt: new Date(),
          })
          .where(eq(userPointsTable.id, userPoints.id));

        userPoints.currentPoints = newPoints;
      }

      // Add to history
      await db.insert(pointHistoryTable).values({
        userPointsId: userPoints.id,
        todoId: todoId,
        points: pointsToAdd,
        reason: reason,
      });

      return userPoints.currentPoints;
    } catch (error) {
      logger.error('Error adding user points:', error);
      throw error;
    }
  }

  /**
   * Get or create streak for a daily todo
   */
  async getOrCreateStreak(todoId: UUID, entityId: UUID): Promise<StreakData> {
    try {
      const db = this.runtime.db;

      const [streak] = await db
        .select()
        .from(dailyStreaksTable)
        .where(and(eq(dailyStreaksTable.todoId, todoId), eq(dailyStreaksTable.entityId, entityId)))
        .limit(1);

      if (streak) {
        return { ...streak, id: streak.id as UUID };
      }

      // Create new streak
      const [newStreak] = await db
        .insert(dailyStreaksTable)
        .values({
          todoId,
          entityId,
          currentStreak: 0,
          longestStreak: 0,
        })
        .returning();

      return { ...newStreak, id: newStreak.id as UUID };
    } catch (error) {
      logger.error('Error getting/creating streak:', error);
      throw error;
    }
  }

  /**
   * Update streak for a daily todo
   */
  async updateStreak(todoId: UUID, entityId: UUID, increment: boolean): Promise<StreakData> {
    try {
      const db = this.runtime.db;

      const streak = await this.getOrCreateStreak(todoId, entityId);

      if (increment) {
        const newStreak = streak.currentStreak + 1;
        const newLongest = Math.max(newStreak, streak.longestStreak);

        await db
          .update(dailyStreaksTable)
          .set({
            currentStreak: newStreak,
            longestStreak: newLongest,
            lastCompletedDate: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(dailyStreaksTable.id, streak.id as UUID));

        return {
          ...streak,
          currentStreak: newStreak,
          longestStreak: newLongest,
          lastCompletedDate: new Date(),
        };
      } else {
        // Reset streak
        await db
          .update(dailyStreaksTable)
          .set({
            currentStreak: 0,
            updatedAt: new Date(),
          })
          .where(eq(dailyStreaksTable.id, streak.id as UUID));

        return {
          ...streak,
          currentStreak: 0,
        };
      }
    } catch (error) {
      logger.error('Error updating streak:', error);
      throw error;
    }
  }

  /**
   * Get overdue todos
   */
  async getOverdueTodos(): Promise<TodoData[]> {
    try {
      const db = this.runtime.db;
      const now = new Date();

      const todos = await db
        .select()
        .from(todosTable)
        .where(
          and(
            eq(todosTable.type, 'one-off'),
            eq(todosTable.isCompleted, false),
            not(isNull(todosTable.dueDate)),
            sql`${todosTable.dueDate} < ${now}`
          )
        );

      // Get tags
      const todoIds = todos.map((t) => t.id);
      const tags =
        todoIds.length > 0
          ? await db.select().from(todoTagsTable).where(inArray(todoTagsTable.todoId, todoIds))
          : [];

      const tagsByTodo = tags.reduce(
        (acc, tag) => {
          if (!acc[tag.todoId]) acc[tag.todoId] = [];
          acc[tag.todoId].push(tag.tag);
          return acc;
        },
        {} as Record<string, string[]>
      );

      return todos.map((todo) => ({
        ...todo,
        tags: tagsByTodo[todo.id] || [],
      }));
    } catch (error) {
      logger.error('Error getting overdue todos:', error);
      throw error;
    }
  }

  /**
   * Reset daily todos (for daily reset task)
   */
  async resetDailyTodos(agentId: UUID): Promise<number> {
    try {
      const db = this.runtime.db;

      const result = await db
        .update(todosTable)
        .set({
          isCompleted: false,
          completedAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(todosTable.agentId, agentId),
            eq(todosTable.type, 'daily'),
            eq(todosTable.isCompleted, true)
          )
        );

      return result.count || 0;
    } catch (error) {
      logger.error('Error resetting daily todos:', error);
      throw error;
    }
  }
}

/**
 * Create a todo data service instance
 */
export function createTodoDataService(runtime: IAgentRuntime): TodoDataService {
  return new TodoDataService(runtime);
}
