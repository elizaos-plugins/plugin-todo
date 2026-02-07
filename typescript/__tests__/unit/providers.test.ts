import type { IAgentRuntime, Memory, State, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @elizaos/core
// ---------------------------------------------------------------------------

vi.mock("@elizaos/core", async () => {
  const actual: Record<string, unknown> = await vi.importActual("@elizaos/core");
  return {
    ...actual,
    logger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    createUniqueUuid: vi.fn((_runtime: unknown, entityId: string) => entityId),
  };
});

// ---------------------------------------------------------------------------
// Mock the generated specs
// ---------------------------------------------------------------------------

vi.mock("../../generated/specs/specs", () => ({
  allProviderDocs: [{ name: "todos", description: "Information about the user's current tasks" }],
}));

// ---------------------------------------------------------------------------
// In-memory todo store for the mock data service
// ---------------------------------------------------------------------------

let mockTodos: Record<string, unknown>[] = [];

vi.mock("../../services/todoDataService", () => ({
  createTodoDataService: vi.fn(() => ({
    getTodos: vi.fn(async (filters?: Record<string, unknown>) => {
      let results = [...mockTodos];
      if (filters?.entityId) results = results.filter((t) => t.entityId === filters.entityId);
      if (filters?.roomId) results = results.filter((t) => t.roomId === filters.roomId);
      if (filters?.isCompleted !== undefined)
        results = results.filter((t) => t.isCompleted === filters.isCompleted);
      return results;
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Import the provider after mocks
// ---------------------------------------------------------------------------

import { todosProvider } from "../../providers/todos";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testAgentId = crypto.randomUUID() as UUID;
const testRoomId = crypto.randomUUID() as UUID;
const testEntityId = crypto.randomUUID() as UUID;
const testWorldId = crypto.randomUUID() as UUID;

function createMockRuntime(overrides?: Partial<IAgentRuntime>): IAgentRuntime {
  return {
    agentId: testAgentId,
    getRoom: vi.fn(async () => ({
      id: testRoomId,
      worldId: testWorldId,
      agentId: testAgentId,
      source: "test",
      type: "SELF",
    })),
    getService: vi.fn(() => null),
    getSetting: vi.fn(() => undefined),
    ...overrides,
  } as unknown as IAgentRuntime;
}

function createMockMessage(overrides?: Partial<Memory>): Memory {
  return {
    id: crypto.randomUUID() as UUID,
    entityId: testEntityId,
    roomId: testRoomId,
    worldId: testWorldId,
    content: { text: "show my todos", source: "test" },
    createdAt: Date.now(),
    ...overrides,
  } as Memory;
}

function createMockState(overrides?: Partial<State>): State {
  return {
    values: {},
    data: { room: { id: testRoomId, worldId: testWorldId } },
    text: "test",
    ...overrides,
  } as unknown as State;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("todosProvider", () => {
  let runtime: IAgentRuntime;

  beforeEach(() => {
    mockTodos = [];
    runtime = createMockRuntime();
  });

  describe("metadata", () => {
    it("should have name 'todos'", () => {
      expect(todosProvider.name).toBe("todos");
    });

    it("should have a description", () => {
      expect(todosProvider.description).toBeTruthy();
      expect(todosProvider.description?.length).toBeGreaterThan(0);
    });
  });

  describe("get() with no todos", () => {
    it("should return structured output with text, data, and values", async () => {
      const message = createMockMessage();
      const state = createMockState();

      const result = await todosProvider.get?.(runtime, message, state);

      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
      expect(typeof result.text).toBe("string");
      expect(result.data).toBeDefined();
      expect(result.values).toBeDefined();
    });

    it("should contain section headers in text output", async () => {
      const message = createMockMessage();
      const state = createMockState();

      const result = await todosProvider.get?.(runtime, message, state);

      expect(result.text).toContain("Daily Todos");
      expect(result.text).toContain("One-off Todos");
      expect(result.text).toContain("Aspirational Todos");
      expect(result.text).toContain("Recently Completed");
    });

    it("should return empty arrays in data when no todos", async () => {
      const message = createMockMessage();
      const state = createMockState();

      const result = await todosProvider.get?.(runtime, message, state);

      expect(result.data?.dailyTodos).toEqual([]);
      expect(result.data?.oneOffTodos).toEqual([]);
      expect(result.data?.aspirationalTodos).toEqual([]);
      expect(result.data?.completedTodos).toEqual([]);
    });

    it("should return 'None' in values when no todos", async () => {
      const message = createMockMessage();
      const state = createMockState();

      const result = await todosProvider.get?.(runtime, message, state);

      expect(result.values?.dailyTasks).toBe("None");
      expect(result.values?.oneOffTasks).toBe("None");
      expect(result.values?.aspirationalTasks).toBe("None");
      expect(result.values?.completedTasks).toBe("None");
    });
  });

  describe("get() with real todos", () => {
    beforeEach(() => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);

      mockTodos = [
        {
          id: crypto.randomUUID(),
          entityId: testEntityId,
          roomId: testRoomId,
          name: "Morning exercise",
          description: "Do 50 pushups",
          type: "daily",
          priority: null,
          isUrgent: false,
          isCompleted: false,
          dueDate: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
          metadata: { streak: 5 },
          tags: ["daily"],
        },
        {
          id: crypto.randomUUID(),
          entityId: testEntityId,
          roomId: testRoomId,
          name: "Finish report",
          description: "Quarterly report",
          type: "one-off",
          priority: 2,
          isUrgent: true,
          isCompleted: false,
          dueDate: new Date(now.getTime() + 86400000),
          completedAt: null,
          createdAt: now,
          updatedAt: now,
          metadata: {},
          tags: ["one-off", "urgent"],
        },
        {
          id: crypto.randomUUID(),
          entityId: testEntityId,
          roomId: testRoomId,
          name: "Learn Rust",
          description: "Become proficient",
          type: "aspirational",
          priority: null,
          isUrgent: false,
          isCompleted: false,
          dueDate: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
          metadata: {},
          tags: ["aspirational"],
        },
        {
          id: crypto.randomUUID(),
          entityId: testEntityId,
          roomId: testRoomId,
          name: "Old completed task",
          description: "Done",
          type: "one-off",
          priority: 3,
          isUrgent: false,
          isCompleted: true,
          dueDate: null,
          completedAt: yesterday,
          createdAt: now,
          updatedAt: now,
          metadata: { pointsAwarded: 10 },
          tags: ["one-off"],
        },
      ];
    });

    it("should show daily todos in text output", async () => {
      const message = createMockMessage();
      const state = createMockState();

      const result = await todosProvider.get?.(runtime, message, state);

      expect(result.text).toContain("Morning exercise");
      expect(result.text).toContain("streak");
    });

    it("should show one-off todos with priority and urgency", async () => {
      const message = createMockMessage();
      const state = createMockState();

      const result = await todosProvider.get?.(runtime, message, state);

      expect(result.text).toContain("Finish report");
      expect(result.text).toContain("P2");
      expect(result.text).toContain("URGENT");
    });

    it("should show aspirational todos", async () => {
      const message = createMockMessage();
      const state = createMockState();

      const result = await todosProvider.get?.(runtime, message, state);

      expect(result.text).toContain("Learn Rust");
      expect(result.text).toContain("aspirational");
    });

    it("should show recently completed todos", async () => {
      const message = createMockMessage();
      const state = createMockState();

      const result = await todosProvider.get?.(runtime, message, state);

      expect(result.text).toContain("Old completed task");
    });

    it("should categorize todos correctly in data", async () => {
      const message = createMockMessage();
      const state = createMockState();

      const result = await todosProvider.get?.(runtime, message, state);

      expect(result.data?.dailyTodos).toHaveLength(1);
      expect(result.data?.oneOffTodos).toHaveLength(1);
      expect(result.data?.aspirationalTodos).toHaveLength(1);
      expect(result.data?.completedTodos).toHaveLength(1);
    });

    it("should include todo fields in data objects", async () => {
      const message = createMockMessage();
      const state = createMockState();

      const result = await todosProvider.get?.(runtime, message, state);

      const dailyTodo = (result.data?.dailyTodos as Record<string, unknown>[])[0];
      expect(dailyTodo.name).toBe("Morning exercise");
      expect(dailyTodo.type).toBe("daily");
      expect(dailyTodo.isCompleted).toBe(false);

      const oneOffTodo = (result.data?.oneOffTodos as Record<string, unknown>[])[0];
      expect(oneOffTodo.name).toBe("Finish report");
      expect(oneOffTodo.priority).toBe(2);
      expect(oneOffTodo.isUrgent).toBe(true);
    });

    it("should populate formatted values", async () => {
      const message = createMockMessage();
      const state = createMockState();

      const result = await todosProvider.get?.(runtime, message, state);

      expect(result.values?.dailyTasks).toContain("Morning exercise");
      expect(result.values?.oneOffTasks).toContain("Finish report");
      expect(result.values?.aspirationalTasks).toContain("Learn Rust");
    });
  });

  describe("get() error handling", () => {
    it("should return error text when roomId is missing", async () => {
      const message = createMockMessage({ roomId: undefined as unknown as UUID });
      const state = createMockState();

      const result = await todosProvider.get?.(runtime, message, state);

      expect(result.text).toContain("No room context");
    });

    it("should return error text when an exception occurs", async () => {
      const failingRuntime = createMockRuntime({
        getRoom: vi.fn(async () => {
          throw new Error("DB connection failed");
        }),
      });

      const message = createMockMessage();
      const state = createMockState();

      const result = await todosProvider.get?.(failingRuntime, message, state);

      expect(result.text).toContain("error");
    });
  });
});
