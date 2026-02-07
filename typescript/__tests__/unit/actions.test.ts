import type { IAgentRuntime, Memory, State, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @elizaos/core – must be before action imports
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
  };
});

// ---------------------------------------------------------------------------
// Mock the generated specs so tests don't depend on build artifacts
// ---------------------------------------------------------------------------

vi.mock("../../generated/specs/spec-helpers", () => ({
  requireActionSpec: (name: string) => {
    const specs: Record<
      string,
      { name: string; description: string; similes: string[]; examples: unknown[] }
    > = {
      CREATE_TODO: {
        name: "CREATE_TODO",
        description:
          "Creates a new todo item from a user description (daily, one-off, or aspirational) immediately.",
        similes: ["ADD_TODO", "NEW_TASK", "ADD_TASK", "CREATE_TASK"],
        examples: [],
      },
      COMPLETE_TODO: {
        name: "COMPLETE_TODO",
        description: "Marks a todo item as completed.",
        similes: ["MARK_COMPLETE", "FINISH_TASK", "DONE", "TASK_DONE", "TASK_COMPLETED"],
        examples: [],
      },
      UPDATE_TODO: {
        name: "UPDATE_TODO",
        description: "Updates an existing todo item immediately based on user description.",
        similes: ["EDIT_TODO", "MODIFY_TASK", "CHANGE_TASK", "MODIFY_TODO", "EDIT_TASK"],
        examples: [],
      },
      CANCEL_TODO: {
        name: "CANCEL_TODO",
        description: "Cancels and deletes a todo item from the user",
        similes: ["DELETE_TODO", "REMOVE_TASK", "DELETE_TASK", "REMOVE_TODO"],
        examples: [],
      },
      CONFIRM_TODO: {
        name: "CONFIRM_TODO",
        description: "Confirms or cancels a pending todo creation after user review.",
        similes: ["CONFIRM_TASK", "APPROVE_TODO", "APPROVE_TASK", "TODO_CONFIRM"],
        examples: [],
      },
    };
    return specs[name] ?? { name, description: "", similes: [], examples: [] };
  },
}));

vi.mock("../../generated/prompts/typescript/prompts.js", () => ({
  extractTodoTemplate: "mock template {{text}} {{messageHistory}}",
  extractCompletionTemplate: "mock completion {{text}} {{availableTasks}} {{messageHistory}}",
  extractTaskSelectionTemplate: "mock selection {{text}} {{availableTasks}}",
  extractTaskUpdateTemplate: "mock update {{text}} {{taskDetails}}",
  extractCancellationTemplate: "mock cancel {{text}} {{availableTasks}} {{messageHistory}}",
  extractConfirmationTemplate: "mock confirm {{text}} {{messageHistory}} {{pendingTask}}",
}));

// ---------------------------------------------------------------------------
// Mock todoDataService so action handlers don't touch a real DB
// ---------------------------------------------------------------------------

const mockTodos: Record<string, unknown>[] = [];

vi.mock("../../services/todoDataService", () => {
  return {
    createTodoDataService: vi.fn(() => ({
      createTodo: vi.fn(async (data: Record<string, unknown>) => {
        const id = crypto.randomUUID();
        mockTodos.push({ id, ...data, isCompleted: false });
        return id;
      }),
      getTodo: vi.fn(async (id: string) => mockTodos.find((t) => t.id === id) ?? null),
      getTodos: vi.fn(async (filters?: Record<string, unknown>) => {
        let results = [...mockTodos];
        if (filters?.roomId) results = results.filter((t) => t.roomId === filters.roomId);
        if (filters?.entityId) results = results.filter((t) => t.entityId === filters.entityId);
        if (filters?.isCompleted !== undefined)
          results = results.filter((t) => t.isCompleted === filters.isCompleted);
        return results;
      }),
      updateTodo: vi.fn(async (id: string, updates: Record<string, unknown>) => {
        const todo = mockTodos.find((t) => t.id === id);
        if (todo) Object.assign(todo, updates);
        return true;
      }),
      deleteTodo: vi.fn(async (id: string) => {
        const idx = mockTodos.findIndex((t) => t.id === id);
        if (idx >= 0) mockTodos.splice(idx, 1);
        return true;
      }),
    })),
    TodoDataService: class {},
  };
});

// ---------------------------------------------------------------------------
// Import actions after all mocks are set up
// ---------------------------------------------------------------------------

import { cancelTodoAction } from "../../actions/cancelTodo";
import { completeTodoAction } from "../../actions/completeTodo";
import { confirmTodoAction } from "../../actions/confirmTodo";
import { createTodoAction } from "../../actions/createTodo";
import { updateTodoAction } from "../../actions/updateTodo";

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
    useModel: vi.fn(async () => ""),
    getRoom: vi.fn(async () => ({
      id: testRoomId,
      worldId: testWorldId,
      agentId: testAgentId,
      source: "test",
      type: "SELF",
    })),
    composeState: vi.fn(async () => createMockState()),
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
    content: { text: "test message", source: "test" },
    createdAt: Date.now(),
    ...overrides,
  } as Memory;
}

function createMockState(overrides?: Partial<State>): State {
  return {
    values: {},
    data: {
      messages: [],
      entities: [],
    },
    text: "test",
    ...overrides,
  } as unknown as State;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Action Metadata", () => {
  describe("createTodoAction", () => {
    it("should have correct name", () => {
      expect(createTodoAction.name).toBe("CREATE_TODO");
    });

    it("should have a description", () => {
      expect(createTodoAction.description).toBeTruthy();
      expect(createTodoAction.description?.length).toBeGreaterThan(0);
    });

    it("should have similes", () => {
      expect(createTodoAction.similes).toBeDefined();
      expect(createTodoAction.similes?.length).toBeGreaterThan(0);
      expect(createTodoAction.similes).toContain("ADD_TODO");
    });
  });

  describe("completeTodoAction", () => {
    it("should have correct name", () => {
      expect(completeTodoAction.name).toBe("COMPLETE_TODO");
    });

    it("should have a description", () => {
      expect(completeTodoAction.description).toBeTruthy();
    });

    it("should have similes including MARK_COMPLETE", () => {
      expect(completeTodoAction.similes).toContain("MARK_COMPLETE");
    });
  });

  describe("updateTodoAction", () => {
    it("should have correct name", () => {
      expect(updateTodoAction.name).toBe("UPDATE_TODO");
    });

    it("should have a description", () => {
      expect(updateTodoAction.description).toBeTruthy();
    });

    it("should have similes including EDIT_TODO", () => {
      expect(updateTodoAction.similes).toContain("EDIT_TODO");
    });
  });

  describe("cancelTodoAction", () => {
    it("should have correct name", () => {
      expect(cancelTodoAction.name).toBe("CANCEL_TODO");
    });

    it("should have a description", () => {
      expect(cancelTodoAction.description).toBeTruthy();
    });

    it("should have similes including DELETE_TODO", () => {
      expect(cancelTodoAction.similes).toContain("DELETE_TODO");
    });
  });

  describe("confirmTodoAction", () => {
    it("should have correct name", () => {
      expect(confirmTodoAction.name).toBe("CONFIRM_TODO");
    });

    it("should have a description", () => {
      expect(confirmTodoAction.description).toBeTruthy();
    });

    it("should have similes including CONFIRM_TASK", () => {
      expect(confirmTodoAction.similes).toContain("CONFIRM_TASK");
    });
  });
});

describe("Action validate()", () => {
  let runtime: IAgentRuntime;

  beforeEach(() => {
    mockTodos.length = 0;
    runtime = createMockRuntime();
  });

  describe("createTodoAction.validate", () => {
    it("should return true when message has task intent keywords", async () => {
      const message = createMockMessage({ content: { text: "Add a new task to buy groceries" } });
      const result = await createTodoAction.validate?.(runtime, message);
      expect(result).toBe(true);
    });

    it("should return true for 'remind me' messages", async () => {
      const message = createMockMessage({ content: { text: "Remind me to call the dentist" } });
      const result = await createTodoAction.validate?.(runtime, message);
      expect(result).toBe(true);
    });

    it("should return true for 'need to' messages", async () => {
      const message = createMockMessage({ content: { text: "I need to finish my homework" } });
      const result = await createTodoAction.validate?.(runtime, message);
      expect(result).toBe(true);
    });

    it("should return true for 'don't forget' messages", async () => {
      const message = createMockMessage({ content: { text: "Don't forget to water the plants" } });
      const result = await createTodoAction.validate?.(runtime, message);
      expect(result).toBe(true);
    });

    it("should return false when message has no task intent", async () => {
      const message = createMockMessage({ content: { text: "What is the weather today?" } });
      const result = await createTodoAction.validate?.(runtime, message);
      expect(result).toBe(false);
    });
  });

  describe("completeTodoAction.validate", () => {
    it("should return false when no room ID", async () => {
      const message = createMockMessage({ roomId: undefined as unknown as UUID });
      const result = await completeTodoAction.validate?.(runtime, message);
      expect(result).toBe(false);
    });

    it("should return false when no incomplete todos exist", async () => {
      const message = createMockMessage();
      const result = await completeTodoAction.validate?.(runtime, message);
      expect(result).toBe(false);
    });

    it("should return true when incomplete todos exist", async () => {
      mockTodos.push({
        id: crypto.randomUUID(),
        roomId: testRoomId,
        name: "Existing task",
        isCompleted: false,
      });
      const message = createMockMessage();
      const result = await completeTodoAction.validate?.(runtime, message);
      expect(result).toBe(true);
    });
  });

  describe("updateTodoAction.validate", () => {
    it("should return false when no room ID", async () => {
      const message = createMockMessage({ roomId: undefined as unknown as UUID });
      const result = await updateTodoAction.validate?.(runtime, message);
      expect(result).toBe(false);
    });

    it("should return true when incomplete todos exist", async () => {
      mockTodos.push({
        id: crypto.randomUUID(),
        roomId: testRoomId,
        name: "Task to update",
        isCompleted: false,
      });
      const message = createMockMessage();
      const result = await updateTodoAction.validate?.(runtime, message);
      expect(result).toBe(true);
    });
  });

  describe("cancelTodoAction.validate", () => {
    it("should return false when no room ID", async () => {
      const message = createMockMessage({ roomId: undefined as unknown as UUID });
      const result = await cancelTodoAction.validate?.(runtime, message);
      expect(result).toBe(false);
    });

    it("should return true when incomplete todos exist", async () => {
      mockTodos.push({
        id: crypto.randomUUID(),
        roomId: testRoomId,
        name: "Task to cancel",
        isCompleted: false,
      });
      const message = createMockMessage();
      const result = await cancelTodoAction.validate?.(runtime, message);
      expect(result).toBe(true);
    });
  });

  describe("confirmTodoAction.validate", () => {
    it("should return true when state has pendingTodo", async () => {
      const state = createMockState({
        data: { pendingTodo: { name: "Test", taskType: "one-off" } },
      });
      const message = createMockMessage();
      const result = await confirmTodoAction.validate?.(runtime, message, state);
      expect(result).toBe(true);
    });

    it("should return false when state has no pendingTodo", async () => {
      const state = createMockState({ data: {} });
      const message = createMockMessage();
      const result = await confirmTodoAction.validate?.(runtime, message, state);
      expect(result).toBe(false);
    });

    it("should return false when state is undefined", async () => {
      const message = createMockMessage();
      const result = await confirmTodoAction.validate?.(runtime, message, undefined);
      expect(result).toBe(false);
    });
  });
});

describe("Action handler()", () => {
  let runtime: IAgentRuntime;
  let callback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTodos.length = 0;
    callback = vi.fn();
    runtime = createMockRuntime();
  });

  describe("createTodoAction.handler", () => {
    it("should fail without roomId", async () => {
      const message = createMockMessage({ roomId: undefined as unknown as UUID });
      await createTodoAction.handler(runtime, message, createMockState(), undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].text).toContain("cannot create a todo");
      expect(callback.mock.calls[0][0].actions).toContain("CREATE_TODO_FAILED");
    });

    it("should fail without entityId", async () => {
      const message = createMockMessage({ entityId: undefined as unknown as UUID });
      await createTodoAction.handler(runtime, message, createMockState(), undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].actions).toContain("CREATE_TODO_FAILED");
    });

    it("should call useModel to extract todo info", async () => {
      // useModel returns XML-like response that parseKeyValueXml can parse
      (runtime.useModel as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "<response><name>Buy groceries</name><taskType>one-off</taskType><priority>2</priority><urgent>false</urgent><dueDate>null</dueDate></response>"
      );

      const message = createMockMessage({
        content: { text: "Add a todo to buy groceries", source: "test" },
      });
      const _result = await createTodoAction.handler(
        runtime,
        message,
        createMockState(),
        undefined,
        callback
      );

      expect(runtime.useModel).toHaveBeenCalled();
    });

    it("should detect duplicate todos and not create them", async () => {
      // Pre-populate with existing todo
      mockTodos.push({
        id: crypto.randomUUID(),
        roomId: testRoomId,
        entityId: testEntityId,
        name: "Buy groceries",
        isCompleted: false,
      });

      // useModel returns a matching name
      (runtime.useModel as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "<response><name>Buy groceries</name><taskType>one-off</taskType></response>"
      );

      const message = createMockMessage({
        content: { text: "Add todo: buy groceries", source: "test" },
      });
      const _result = await createTodoAction.handler(
        runtime,
        message,
        createMockState(),
        undefined,
        callback
      );

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].text).toContain("already have an active task");
      expect(callback.mock.calls[0][0].actions).toContain("CREATE_TODO_DUPLICATE");
    });

    it("should handle failed extraction gracefully", async () => {
      // useModel returns garbage
      (runtime.useModel as ReturnType<typeof vi.fn>).mockResolvedValueOnce("I don't understand");

      const message = createMockMessage({
        content: { text: "maybe add something", source: "test" },
      });
      await createTodoAction.handler(runtime, message, createMockState(), undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].actions).toContain("CREATE_TODO_FAILED");
    });
  });

  describe("completeTodoAction.handler", () => {
    it("should fail without state", async () => {
      const message = createMockMessage();
      await completeTodoAction.handler(runtime, message, undefined, undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].actions).toContain("COMPLETE_TODO_ERROR");
    });

    it("should fail without roomId", async () => {
      const message = createMockMessage({ roomId: undefined as unknown as UUID });
      await completeTodoAction.handler(runtime, message, createMockState(), undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].actions).toContain("COMPLETE_TODO_ERROR");
    });

    it("should report no tasks when none exist", async () => {
      const message = createMockMessage();
      await completeTodoAction.handler(runtime, message, createMockState(), undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].text).toContain("don't have any incomplete tasks");
      expect(callback.mock.calls[0][0].actions).toContain("COMPLETE_TODO_NO_TASKS");
    });

    it("should complete a task when taskId is passed via options", async () => {
      const todoId = crypto.randomUUID();
      mockTodos.push({
        id: todoId,
        roomId: testRoomId,
        name: "Test task",
        type: "one-off",
        isCompleted: false,
        priority: 3,
        tags: ["one-off"],
      });

      const message = createMockMessage();
      const options = { parameters: { taskId: todoId, taskName: "Test task" } };

      await completeTodoAction.handler(
        runtime,
        message,
        createMockState(),
        options as never,
        callback
      );

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].text).toContain("Test task");
      expect(callback.mock.calls[0][0].actions).toContain("COMPLETE_TODO");
    });
  });

  describe("updateTodoAction.handler", () => {
    it("should fail without state", async () => {
      const message = createMockMessage();
      await updateTodoAction.handler(runtime, message, undefined, undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].actions).toContain("UPDATE_TODO_ERROR");
    });

    it("should fail without roomId", async () => {
      const message = createMockMessage({ roomId: undefined as unknown as UUID });
      await updateTodoAction.handler(runtime, message, createMockState(), undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].actions).toContain("UPDATE_TODO_ERROR");
    });

    it("should report no tasks when none exist", async () => {
      const message = createMockMessage();
      await updateTodoAction.handler(runtime, message, createMockState(), undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].text).toContain("don't have any active tasks");
    });
  });

  describe("cancelTodoAction.handler", () => {
    it("should fail without state", async () => {
      const message = createMockMessage();
      await cancelTodoAction.handler(runtime, message, undefined, undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].actions).toContain("CANCEL_TODO_ERROR");
    });

    it("should fail without roomId", async () => {
      const message = createMockMessage({ roomId: undefined as unknown as UUID });
      await cancelTodoAction.handler(runtime, message, createMockState(), undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].actions).toContain("CANCEL_TODO_ERROR");
    });

    it("should report no tasks when none exist", async () => {
      const message = createMockMessage();
      await cancelTodoAction.handler(runtime, message, createMockState(), undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].text).toContain("don't have any active tasks");
    });
  });

  describe("confirmTodoAction.handler", () => {
    it("should fail without state", async () => {
      const message = createMockMessage();
      await confirmTodoAction.handler(runtime, message, undefined, undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].actions).toContain("CONFIRM_TODO_ERROR");
    });

    it("should report no pending todo when state has none", async () => {
      const state = createMockState({ data: {} });
      const message = createMockMessage();
      await confirmTodoAction.handler(runtime, message, state, undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].text).toContain("don't have a pending task");
      expect(callback.mock.calls[0][0].actions).toContain("CONFIRM_TODO_NO_PENDING");
    });

    it("should fail without roomId when pending todo exists", async () => {
      const state = createMockState({
        data: { pendingTodo: { name: "Test", taskType: "one-off" } },
      });
      const message = createMockMessage({ roomId: undefined as unknown as UUID });
      await confirmTodoAction.handler(runtime, message, state, undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].actions).toContain("CONFIRM_TODO_ERROR");
    });

    it("should call useModel to extract confirmation intent", async () => {
      const state = createMockState({
        data: {
          pendingTodo: { name: "Test task", taskType: "one-off" },
          messages: [],
          entities: [],
        },
      });

      // Mock model returning a confirmation
      (runtime.useModel as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "<response><isConfirmation>true</isConfirmation><shouldProceed>true</shouldProceed><modifications>none</modifications></response>"
      );

      const message = createMockMessage({ content: { text: "Yes, create it", source: "test" } });
      await confirmTodoAction.handler(runtime, message, state, undefined, callback);

      expect(runtime.useModel).toHaveBeenCalled();
    });

    it("should detect duplicate when confirming", async () => {
      mockTodos.push({
        id: crypto.randomUUID(),
        roomId: testRoomId,
        entityId: testEntityId,
        name: "Existing Task",
        isCompleted: false,
      });

      const state = createMockState({
        data: {
          pendingTodo: { name: "Existing Task", taskType: "one-off" },
          messages: [],
          entities: [],
        },
      });

      (runtime.useModel as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        "<response><isConfirmation>true</isConfirmation><shouldProceed>true</shouldProceed><modifications>none</modifications></response>"
      );

      const message = createMockMessage({ content: { text: "Yes", source: "test" } });
      const _result = await confirmTodoAction.handler(runtime, message, state, undefined, callback);

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0].actions).toContain("CONFIRM_TODO_DUPLICATE");
    });
  });
});
