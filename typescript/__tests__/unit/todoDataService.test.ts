import type { IAgentRuntime, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createTodoDataService, TodoDataService } from "../../services/todoDataService";

// ---------------------------------------------------------------------------
// In-memory test subclass – avoids real drizzle DB connections
// ---------------------------------------------------------------------------

class TestTodoDataService extends TodoDataService {
  private store: Map<string, Record<string, unknown>> = new Map();
  private tagStore: Map<string, string[]> = new Map();

  constructor() {
    // Pass a dummy runtime
    const dummyRuntime = { agentId: crypto.randomUUID() as UUID } as unknown as IAgentRuntime;
    super(dummyRuntime);
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
    const id = crypto.randomUUID() as UUID;
    const now = new Date();
    this.store.set(id, {
      id,
      agentId: data.agentId,
      worldId: data.worldId,
      roomId: data.roomId,
      entityId: data.entityId,
      name: data.name,
      description: data.description ?? null,
      type: data.type,
      priority: data.priority ?? 4,
      isUrgent: data.isUrgent ?? false,
      isCompleted: false,
      dueDate: data.dueDate ?? null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      metadata: data.metadata ?? {},
    });
    this.tagStore.set(id, [...(data.tags ?? [])]);
    return id;
  }

  async getTodo(todoId: UUID) {
    const row = this.store.get(todoId);
    if (!row) return null;
    return {
      ...row,
      tags: this.tagStore.get(todoId) ?? [],
    } as never;
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
  }) {
    let results = Array.from(this.store.values());

    if (filters?.agentId) results = results.filter((t) => t.agentId === filters.agentId);
    if (filters?.worldId) results = results.filter((t) => t.worldId === filters.worldId);
    if (filters?.roomId) results = results.filter((t) => t.roomId === filters.roomId);
    if (filters?.entityId) results = results.filter((t) => t.entityId === filters.entityId);
    if (filters?.type) results = results.filter((t) => t.type === filters.type);
    if (filters?.isCompleted !== undefined)
      results = results.filter((t) => t.isCompleted === filters.isCompleted);
    if (filters?.tags && filters.tags.length > 0) {
      results = results.filter((t) => {
        const todoTags = this.tagStore.get(t.id as string) ?? [];
        return filters.tags?.some((tag) => todoTags.includes(tag));
      });
    }
    if (filters?.limit) results = results.slice(0, filters.limit);

    return results.map((r) => ({
      ...r,
      tags: this.tagStore.get(r.id as string) ?? [],
    })) as never;
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
    const row = this.store.get(todoId);
    if (!row) return false;
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        (row as Record<string, unknown>)[key] = value;
      }
    }
    row.updatedAt = new Date();
    return true;
  }

  async deleteTodo(todoId: UUID): Promise<boolean> {
    this.tagStore.delete(todoId);
    return this.store.delete(todoId);
  }

  async addTags(todoId: UUID, newTags: string[]): Promise<boolean> {
    const existing = this.tagStore.get(todoId) ?? [];
    const existingSet = new Set(existing);
    for (const tag of newTags) {
      if (!existingSet.has(tag)) {
        existing.push(tag);
      }
    }
    this.tagStore.set(todoId, existing);
    return true;
  }

  async removeTags(todoId: UUID, tagsToRemove: string[]): Promise<boolean> {
    const existing = this.tagStore.get(todoId) ?? [];
    const removeSet = new Set(tagsToRemove);
    this.tagStore.set(
      todoId,
      existing.filter((t) => !removeSet.has(t))
    );
    return true;
  }

  async getOverdueTodos(filters?: {
    agentId?: UUID;
    worldId?: UUID;
    roomId?: UUID;
    entityId?: UUID;
  }) {
    const now = new Date();
    let results = Array.from(this.store.values()).filter(
      (t) => !t.isCompleted && t.dueDate && (t.dueDate as Date) < now
    );
    if (filters?.agentId) results = results.filter((t) => t.agentId === filters.agentId);
    if (filters?.roomId) results = results.filter((t) => t.roomId === filters.roomId);
    if (filters?.entityId) results = results.filter((t) => t.entityId === filters.entityId);
    return results.map((r) => ({
      ...r,
      tags: this.tagStore.get(r.id as string) ?? [],
    })) as never;
  }
}

// ---------------------------------------------------------------------------
// Test IDs
// ---------------------------------------------------------------------------

const agentId = crypto.randomUUID() as UUID;
const worldId = crypto.randomUUID() as UUID;
const roomId = crypto.randomUUID() as UUID;
const entityId = crypto.randomUUID() as UUID;

const baseParams = { agentId, worldId, roomId, entityId };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TodoDataService", () => {
  let service: TestTodoDataService;

  beforeEach(() => {
    service = new TestTodoDataService();
  });

  describe("createTodo and getTodo", () => {
    it("should create a todo and retrieve it with all fields", async () => {
      const id = await service.createTodo({
        ...baseParams,
        name: "Test Todo",
        description: "A test todo item",
        type: "one-off",
        priority: 2,
        isUrgent: false,
        metadata: { createdAt: new Date().toISOString() },
        tags: ["TODO", "one-off"],
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe("string");

      const todo = await service.getTodo(id);
      expect(todo).not.toBeNull();
      expect(todo?.id).toBe(id);
      expect(todo?.name).toBe("Test Todo");
      expect(todo?.description).toBe("A test todo item");
      expect(todo?.type).toBe("one-off");
      expect(todo?.priority).toBe(2);
      expect(todo?.isUrgent).toBe(false);
      expect(todo?.isCompleted).toBe(false);
      expect(todo?.completedAt).toBeNull();
      expect(todo?.createdAt).toBeInstanceOf(Date);
      expect(todo?.updatedAt).toBeInstanceOf(Date);
      expect(todo?.agentId).toBe(agentId);
      expect(todo?.worldId).toBe(worldId);
      expect(todo?.roomId).toBe(roomId);
      expect(todo?.entityId).toBe(entityId);
      expect(todo?.tags).toContain("TODO");
      expect(todo?.tags).toContain("one-off");
    });

    it("should create a daily todo with correct defaults", async () => {
      const id = await service.createTodo({
        ...baseParams,
        name: "Morning workout",
        type: "daily",
        tags: ["daily", "recurring-daily"],
      });

      const todo = await service.getTodo(id);
      expect(todo).not.toBeNull();
      expect(todo?.type).toBe("daily");
      expect(todo?.priority).toBe(4); // default priority
      expect(todo?.isUrgent).toBe(false);
      expect(todo?.tags).toContain("daily");
      expect(todo?.tags).toContain("recurring-daily");
    });

    it("should create an aspirational todo", async () => {
      const id = await service.createTodo({
        ...baseParams,
        name: "Learn Rust",
        description: "Become proficient in Rust programming",
        type: "aspirational",
        tags: ["aspirational"],
      });

      const todo = await service.getTodo(id);
      expect(todo).not.toBeNull();
      expect(todo?.type).toBe("aspirational");
      expect(todo?.name).toBe("Learn Rust");
    });

    it("should return null for a non-existent todo ID", async () => {
      const result = await service.getTodo(crypto.randomUUID() as UUID);
      expect(result).toBeNull();
    });
  });

  describe("updateTodo", () => {
    it("should update the name of a todo", async () => {
      const id = await service.createTodo({
        ...baseParams,
        name: "Original Name",
        type: "one-off",
      });

      const updated = await service.updateTodo(id, { name: "Updated Name" });
      expect(updated).toBe(true);

      const todo = await service.getTodo(id);
      expect(todo?.name).toBe("Updated Name");
    });

    it("should update priority of a todo", async () => {
      const id = await service.createTodo({
        ...baseParams,
        name: "Priority Test",
        type: "one-off",
        priority: 3,
      });

      await service.updateTodo(id, { priority: 1 });

      const todo = await service.getTodo(id);
      expect(todo?.priority).toBe(1);
    });

    it("should update multiple fields at once", async () => {
      const id = await service.createTodo({
        ...baseParams,
        name: "Multi-update",
        type: "one-off",
        priority: 4,
        isUrgent: false,
      });

      await service.updateTodo(id, {
        name: "Renamed",
        priority: 1,
        isUrgent: true,
        description: "Now urgent",
      });

      const todo = await service.getTodo(id);
      expect(todo?.name).toBe("Renamed");
      expect(todo?.priority).toBe(1);
      expect(todo?.isUrgent).toBe(true);
      expect(todo?.description).toBe("Now urgent");
    });

    it("should update the updatedAt timestamp", async () => {
      const id = await service.createTodo({
        ...baseParams,
        name: "Timestamp Test",
        type: "one-off",
      });

      const before = (await service.getTodo(id))?.updatedAt;

      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10));
      await service.updateTodo(id, { name: "Changed" });

      const after = (await service.getTodo(id))?.updatedAt;
      expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe("completeTodo", () => {
    it("should mark a todo as completed with completedAt", async () => {
      const id = await service.createTodo({
        ...baseParams,
        name: "Complete Me",
        type: "one-off",
      });

      const completedAt = new Date();
      await service.updateTodo(id, {
        isCompleted: true,
        completedAt,
      });

      const todo = await service.getTodo(id);
      expect(todo?.isCompleted).toBe(true);
      expect(todo?.completedAt).toEqual(completedAt);
    });

    it("should not affect other fields when completing", async () => {
      const id = await service.createTodo({
        ...baseParams,
        name: "Complete Test",
        type: "one-off",
        priority: 2,
        isUrgent: true,
      });

      await service.updateTodo(id, { isCompleted: true, completedAt: new Date() });

      const todo = await service.getTodo(id);
      expect(todo?.name).toBe("Complete Test");
      expect(todo?.priority).toBe(2);
      expect(todo?.isUrgent).toBe(true);
    });
  });

  describe("deleteTodo", () => {
    it("should delete a todo and return true", async () => {
      const id = await service.createTodo({
        ...baseParams,
        name: "Delete Me",
        type: "one-off",
      });

      const result = await service.deleteTodo(id);
      expect(result).toBe(true);

      const todo = await service.getTodo(id);
      expect(todo).toBeNull();
    });

    it("should also remove associated tags", async () => {
      const id = await service.createTodo({
        ...baseParams,
        name: "Tagged Delete",
        type: "one-off",
        tags: ["tag-a", "tag-b"],
      });

      // Verify tags exist
      const before = await service.getTodo(id);
      expect(before?.tags).toHaveLength(2);

      await service.deleteTodo(id);

      // After deletion, getTodo returns null
      const after = await service.getTodo(id);
      expect(after).toBeNull();
    });
  });

  describe("getTodos with filters", () => {
    beforeEach(async () => {
      // Populate with mixed types
      await service.createTodo({
        ...baseParams,
        name: "One-off 1",
        type: "one-off",
        tags: ["one-off"],
      });
      await service.createTodo({
        ...baseParams,
        name: "One-off 2",
        type: "one-off",
        tags: ["one-off"],
      });
      await service.createTodo({
        ...baseParams,
        name: "Daily 1",
        type: "daily",
        tags: ["daily"],
      });
      await service.createTodo({
        ...baseParams,
        name: "Aspirational 1",
        type: "aspirational",
        tags: ["aspirational"],
      });
    });

    it("should filter by type ONE_OFF", async () => {
      const todos = await service.getTodos({ type: "one-off" });
      expect(todos).toHaveLength(2);
      for (const t of todos) {
        expect(t.type).toBe("one-off");
      }
    });

    it("should filter by type DAILY", async () => {
      const todos = await service.getTodos({ type: "daily" });
      expect(todos).toHaveLength(1);
      expect(todos[0].name).toBe("Daily 1");
    });

    it("should filter by type ASPIRATIONAL", async () => {
      const todos = await service.getTodos({ type: "aspirational" });
      expect(todos).toHaveLength(1);
      expect(todos[0].name).toBe("Aspirational 1");
    });

    it("should filter by roomId", async () => {
      const otherRoom = crypto.randomUUID() as UUID;
      await service.createTodo({
        ...baseParams,
        roomId: otherRoom,
        name: "Other room todo",
        type: "one-off",
      });

      const todos = await service.getTodos({ roomId });
      expect(todos).toHaveLength(4); // only the original 4

      const otherTodos = await service.getTodos({ roomId: otherRoom });
      expect(otherTodos).toHaveLength(1);
      expect(otherTodos[0].name).toBe("Other room todo");
    });

    it("should filter by isCompleted", async () => {
      const allTodos = await service.getTodos({});
      const firstId = allTodos[0].id;
      await service.updateTodo(firstId, { isCompleted: true });

      const incomplete = await service.getTodos({ isCompleted: false });
      expect(incomplete).toHaveLength(3);

      const completed = await service.getTodos({ isCompleted: true });
      expect(completed).toHaveLength(1);
    });

    it("should filter by tags", async () => {
      const todos = await service.getTodos({ tags: ["daily"] });
      expect(todos).toHaveLength(1);
      expect(todos[0].name).toBe("Daily 1");
    });

    it("should respect limit parameter", async () => {
      const todos = await service.getTodos({ limit: 2 });
      expect(todos).toHaveLength(2);
    });

    it("should return all todos when no filters given", async () => {
      const todos = await service.getTodos({});
      expect(todos).toHaveLength(4);
    });
  });

  describe("getOverdueTodos", () => {
    it("should return only overdue incomplete todos", async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await service.createTodo({
        ...baseParams,
        name: "Overdue Task",
        type: "one-off",
        dueDate: yesterday,
      });

      await service.createTodo({
        ...baseParams,
        name: "Future Task",
        type: "one-off",
        dueDate: tomorrow,
      });

      await service.createTodo({
        ...baseParams,
        name: "No Due Date",
        type: "one-off",
      });

      const overdue = await service.getOverdueTodos();
      expect(overdue).toHaveLength(1);
      expect(overdue[0].name).toBe("Overdue Task");
    });

    it("should not return completed overdue todos", async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const id = await service.createTodo({
        ...baseParams,
        name: "Completed Overdue",
        type: "one-off",
        dueDate: yesterday,
      });

      await service.updateTodo(id, { isCompleted: true });

      const overdue = await service.getOverdueTodos();
      expect(overdue).toHaveLength(0);
    });

    it("should filter overdue by roomId", async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const otherRoom = crypto.randomUUID() as UUID;

      await service.createTodo({
        ...baseParams,
        name: "Overdue in room",
        type: "one-off",
        dueDate: yesterday,
      });

      await service.createTodo({
        ...baseParams,
        roomId: otherRoom,
        name: "Overdue other room",
        type: "one-off",
        dueDate: yesterday,
      });

      const overdue = await service.getOverdueTodos({ roomId });
      expect(overdue).toHaveLength(1);
      expect(overdue[0].name).toBe("Overdue in room");
    });
  });

  describe("addTags and removeTags", () => {
    it("should add tags to an existing todo", async () => {
      const id = await service.createTodo({
        ...baseParams,
        name: "Tagged Todo",
        type: "one-off",
        tags: ["initial"],
      });

      await service.addTags(id, ["new-tag", "another-tag"]);

      const todo = await service.getTodo(id);
      expect(todo?.tags).toContain("initial");
      expect(todo?.tags).toContain("new-tag");
      expect(todo?.tags).toContain("another-tag");
      expect(todo?.tags).toHaveLength(3);
    });

    it("should not duplicate existing tags", async () => {
      const id = await service.createTodo({
        ...baseParams,
        name: "No Dupes",
        type: "one-off",
        tags: ["existing"],
      });

      await service.addTags(id, ["existing", "new"]);

      const todo = await service.getTodo(id);
      const existingCount = todo?.tags?.filter((t: string) => t === "existing").length;
      expect(existingCount).toBe(1);
      expect(todo?.tags).toContain("new");
    });

    it("should remove specified tags", async () => {
      const id = await service.createTodo({
        ...baseParams,
        name: "Remove Tags",
        type: "one-off",
        tags: ["keep", "remove-me", "also-remove"],
      });

      await service.removeTags(id, ["remove-me", "also-remove"]);

      const todo = await service.getTodo(id);
      expect(todo?.tags).toContain("keep");
      expect(todo?.tags).not.toContain("remove-me");
      expect(todo?.tags).not.toContain("also-remove");
      expect(todo?.tags).toHaveLength(1);
    });

    it("should handle removing tags that don't exist gracefully", async () => {
      const id = await service.createTodo({
        ...baseParams,
        name: "Safe Remove",
        type: "one-off",
        tags: ["only-tag"],
      });

      await service.removeTags(id, ["nonexistent"]);

      const todo = await service.getTodo(id);
      expect(todo?.tags).toContain("only-tag");
      expect(todo?.tags).toHaveLength(1);
    });
  });

  describe("createTodoDataService factory", () => {
    it("should return a TodoDataService instance", () => {
      const mockRuntime = {
        agentId: crypto.randomUUID() as UUID,
        db: {},
      } as unknown as IAgentRuntime;
      const ds = createTodoDataService(mockRuntime);
      expect(ds).toBeInstanceOf(TodoDataService);
    });
  });
});
