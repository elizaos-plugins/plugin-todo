import type { IAgentRuntime, UUID } from "@elizaos/core";
import { logger } from "@elizaos/core";
import type { InferSelectModel } from "drizzle-orm";
import { and, desc, eq, isNull, not, or, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { todoSchema, todosTable, todoTagsTable } from "../schema";

type TodoRow = InferSelectModel<typeof todosTable>;

type DrizzleDatabase = NodePgDatabase | PgliteDatabase;
type RuntimeWithMigrationSupport = IAgentRuntime & {
  adapter?: {
    runPluginMigrations?: (
      plugins: Array<{ name: string; schema?: Record<string, unknown> }>,
      options?: {
        verbose?: boolean;
        force?: boolean;
        dryRun?: boolean;
      }
    ) => Promise<void>;
  };
};

const TODO_PLUGIN_NAME = "@elizaos/plugin-todo";
const schemaBootstrapPromises = new WeakMap<IAgentRuntime, Promise<void>>();

/**
 * Get the Drizzle database instance from the runtime.
 *
 * runtime.db is a getter that returns this.adapter.db — it throws when the
 * adapter hasn't been registered (e.g. plugin-sql failed to load).
 * Guard with a clear error message following the pattern from plugin-trust.
 */
function requireDb(runtime: IAgentRuntime): DrizzleDatabase {
  let db: DrizzleDatabase | undefined;
  try {
    db = runtime.db as DrizzleDatabase | undefined;
  } catch {
    // adapter not set — runtime.db getter threw
  }
  if (!db) {
    throw new Error(
      "[plugin-todo] Database not available. Ensure @elizaos/plugin-sql is loaded and initialized.",
    );
  }
  return db;
}

async function ensureTodoSchema(runtime: IAgentRuntime): Promise<void> {
  const existing = schemaBootstrapPromises.get(runtime);
  if (existing) {
    await existing;
    return;
  }

  const bootstrap = (async () => {
    const adapter = (runtime as RuntimeWithMigrationSupport).adapter;
    if (typeof adapter?.runPluginMigrations !== "function") {
      return;
    }

    const forceDestructive =
      typeof process !== "undefined" &&
      process.env?.ELIZA_ALLOW_DESTRUCTIVE_MIGRATIONS === "true";

    await adapter.runPluginMigrations(
      [{ name: TODO_PLUGIN_NAME, schema: todoSchema as Record<string, unknown> }],
      {
        verbose: false,
        force: forceDestructive,
        dryRun: false,
      }
    );
  })();

  schemaBootstrapPromises.set(runtime, bootstrap);

  try {
    await bootstrap;
  } catch (error) {
    schemaBootstrapPromises.delete(runtime);
    throw error;
  }
}

export interface TodoData {
  id: UUID;
  agentId: UUID;
  worldId: UUID;
  roomId: UUID;
  entityId: UUID;
  name: string;
  description?: string | null;
  type: "daily" | "one-off" | "aspirational";
  priority?: number | null;
  isUrgent: boolean;
  isCompleted: boolean;
  dueDate?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
  tags?: string[];
}

export class TodoDataService {
  protected runtime: IAgentRuntime;

  constructor(runtime: IAgentRuntime) {
    this.runtime = runtime;
  }

  protected async getDb(): Promise<DrizzleDatabase> {
    await ensureTodoSchema(this.runtime);
    return requireDb(this.runtime);
  }

  async createTodo(data: {
    agentId: UUID;
    worldId: UUID;
    roomId: UUID;
    entityId: UUID;
    name: string;
    description?: string;
    type: "daily" | "one-off" | "aspirational";
    priority?: number;
    isUrgent?: boolean;
    dueDate?: Date;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): Promise<UUID> {
    const db = await this.getDb();

    const [todo] = await db
      .insert(todosTable)
      .values({
        agentId: data.agentId,
        worldId: data.worldId,
        roomId: data.roomId,
        entityId: data.entityId,
        name: data.name,
        description: data.description,
        type: data.type,
        priority: data.priority,
        isUrgent: data.isUrgent || false,
        dueDate: data.dueDate,
        metadata: data.metadata || {},
      })
      .returning();

    if (!todo) {
      throw new Error("Failed to create todo");
    }

    if (data.tags && data.tags.length > 0) {
      await db.insert(todoTagsTable).values(
        data.tags.map((tag) => ({
          todoId: todo.id,
          tag,
        }))
      );
    }

    logger.info(`Created todo: ${todo.id} - ${todo.name}`);
    return todo.id as UUID;
  }

  async getTodo(todoId: UUID): Promise<TodoData | null> {
    const db = await this.getDb();

    const todos = await db.select().from(todosTable).where(eq(todosTable.id, todoId));
    const todo = todos[0];

    if (!todo) {
      return null;
    }

    const tags = await db
      .select({ tag: todoTagsTable.tag })
      .from(todoTagsTable)
      .where(eq(todoTagsTable.todoId, todoId));

    return {
      ...(todo as TodoRow),
      tags: tags.map((t: { tag: string }) => t.tag),
    } as TodoData;
  }

  async getTodos(filters?: {
    agentId?: UUID;
    worldId?: UUID;
    roomId?: UUID;
    entityId?: UUID;
    type?: "daily" | "one-off" | "aspirational";
    isCompleted?: boolean;
    tags?: string[];
    limit?: number;
  }): Promise<TodoData[]> {
    const db = await this.getDb();

    const conditions: SQL[] = [];
    if (filters?.agentId) conditions.push(eq(todosTable.agentId, filters.agentId));
    if (filters?.worldId) conditions.push(eq(todosTable.worldId, filters.worldId));
    if (filters?.roomId) conditions.push(eq(todosTable.roomId, filters.roomId));
    if (filters?.entityId) conditions.push(eq(todosTable.entityId, filters.entityId));
    if (filters?.type) conditions.push(eq(todosTable.type, filters.type));
    if (filters?.isCompleted !== undefined)
      conditions.push(eq(todosTable.isCompleted, filters.isCompleted));

    const baseQuery = db.select().from(todosTable);

    const filteredQuery = conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;

    const orderedQuery = filteredQuery.orderBy(desc(todosTable.createdAt));

    const todos: TodoRow[] = filters?.limit
      ? await orderedQuery.limit(filters.limit)
      : await orderedQuery;

    const todosWithTags = await Promise.all(
      todos.map(async (todo: TodoRow) => {
        const tags = await db
          .select({ tag: todoTagsTable.tag })
          .from(todoTagsTable)
          .where(eq(todoTagsTable.todoId, todo.id));

        return {
          ...todo,
          tags: tags.map((t: { tag: string }) => t.tag),
        } as TodoData;
      })
    );

    if (filters?.tags && filters.tags.length > 0) {
      return todosWithTags.filter((todo: TodoData) =>
        filters.tags?.some((tag) => todo.tags?.includes(tag))
      );
    }

    return todosWithTags;
  }

  async updateTodo(
    todoId: UUID,
    updates: {
      name?: string;
      description?: string;
      priority?: number;
      isUrgent?: boolean;
      isCompleted?: boolean;
      dueDate?: Date;
      completedAt?: Date;
      metadata?: Record<string, unknown>;
    }
  ): Promise<boolean> {
    const db = await this.getDb();

    const updateData = {
      ...updates,
      updatedAt: new Date(),
    };

    await db.update(todosTable).set(updateData).where(eq(todosTable.id, todoId));

    return true;
  }

  async deleteTodo(todoId: UUID): Promise<boolean> {
    const db = await this.getDb();

    await db.delete(todosTable).where(eq(todosTable.id, todoId));

    logger.info(`Deleted todo: ${todoId}`);
    return true;
  }

  async addTags(todoId: UUID, tags: string[]): Promise<boolean> {
    const db = await this.getDb();

    const existingTags = await db
      .select({ tag: todoTagsTable.tag })
      .from(todoTagsTable)
      .where(eq(todoTagsTable.todoId, todoId));

    const existingTagSet = new Set(existingTags.map((t: { tag: string }) => t.tag));
    const newTags = tags.filter((tag) => !existingTagSet.has(tag));

    if (newTags.length > 0) {
      await db.insert(todoTagsTable).values(
        newTags.map((tag) => ({
          todoId,
          tag,
        }))
      );
    }

    return true;
  }

  async removeTags(todoId: UUID, tags: string[]): Promise<boolean> {
    const db = await this.getDb();

    await db
      .delete(todoTagsTable)
      .where(
        and(eq(todoTagsTable.todoId, todoId), or(...tags.map((tag) => eq(todoTagsTable.tag, tag))))
      );

    return true;
  }

  async getOverdueTodos(filters?: {
    agentId?: UUID;
    worldId?: UUID;
    roomId?: UUID;
    entityId?: UUID;
  }): Promise<TodoData[]> {
    try {
      const db = await this.getDb();

      const conditions: SQL[] = [
        eq(todosTable.isCompleted, false),
        not(isNull(todosTable.dueDate)),
      ];

      if (filters?.agentId) conditions.push(eq(todosTable.agentId, filters.agentId));
      if (filters?.worldId) conditions.push(eq(todosTable.worldId, filters.worldId));
      if (filters?.roomId) conditions.push(eq(todosTable.roomId, filters.roomId));
      if (filters?.entityId) conditions.push(eq(todosTable.entityId, filters.entityId));

      const todos = await db
        .select()
        .from(todosTable)
        .where(and(...conditions))
        .orderBy(todosTable.dueDate);

      const now = new Date();
      const overdueTodos = todos.filter((todo: TodoRow) => todo.dueDate && todo.dueDate < now);

      const todosWithTags = await Promise.all(
        overdueTodos.map(async (todo: TodoRow) => {
          const tags = await db
            .select({ tag: todoTagsTable.tag })
            .from(todoTagsTable)
            .where(eq(todoTagsTable.todoId, todo.id));

          return {
            ...todo,
            tags: tags.map((t: { tag: string }) => t.tag),
          } as TodoData;
        })
      );

      return todosWithTags;
    } catch (error) {
      logger.error(
        "Error fetching overdue todos:",
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  /**
   * Reset daily todos for a new day
   */
  async resetDailyTodos(filters?: {
    agentId?: UUID;
    worldId?: UUID;
    roomId?: UUID;
    entityId?: UUID;
  }): Promise<number> {
    try {
      const db = await this.getDb();

      const conditions: SQL[] = [eq(todosTable.type, "daily"), eq(todosTable.isCompleted, true)];

      if (filters?.agentId) conditions.push(eq(todosTable.agentId, filters.agentId));
      if (filters?.worldId) conditions.push(eq(todosTable.worldId, filters.worldId));
      if (filters?.roomId) conditions.push(eq(todosTable.roomId, filters.roomId));
      if (filters?.entityId) conditions.push(eq(todosTable.entityId, filters.entityId));

      const _result = await db
        .update(todosTable)
        .set({
          isCompleted: false,
          completedAt: null,
          metadata: {
            completedToday: false,
          },
          updatedAt: new Date(),
        })
        .where(and(...conditions));

      return 0; // Return count of reset todos
    } catch (error) {
      logger.error(
        "Error resetting daily todos:",
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }
}

export function createTodoDataService(runtime: IAgentRuntime): TodoDataService {
  return new TodoDataService(runtime);
}
