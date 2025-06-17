import type { HandlerCallback, IAgentRuntime, Memory, State, UUID } from '@elizaos/core';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createTodoAction } from '../actions/createTodo';
import { createTodoDataService } from '../services/todoDataService.ts';

vi.mock('../services/todoDataService');

describe('createTodoAction', () => {
  let mockRuntime: IAgentRuntime;
  let mockCallback: HandlerCallback;
  let mockState: State;
  let mockDataService: any;

  beforeEach(() => {
    mockDataService = {
      createTodo: vi.fn(),
      getTodos: vi.fn().mockResolvedValue([]),
    };
    (createTodoDataService as Mock).mockReturnValue(mockDataService);

    mockCallback = vi.fn();

    mockRuntime = {
      agentId: 'test-agent' as UUID,
      worldId: 'test-world' as UUID,
      useModel: vi.fn(),
      composeState: vi.fn(),
      db: {} as any,
    } as any;

    mockState = {
      values: {},
      text: '',
      data: {
        messages: [],
        entities: [],
        room: { id: 'room-1', name: 'Test Room', worldId: 'world-1' },
      },
    };

    (mockRuntime.composeState as Mock).mockResolvedValue(mockState);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should have correct action properties', () => {
    expect(createTodoAction.name).toBe('CREATE_TODO');
    expect(createTodoAction.similes).toContain('ADD_TODO');
    expect(createTodoAction.similes).toContain('NEW_TASK');
    expect(createTodoAction.description).toContain('Creates a new todo item');
    expect(createTodoAction.validate).toBeInstanceOf(Function);
    expect(createTodoAction.handler).toBeInstanceOf(Function);
    expect(createTodoAction.examples).toHaveLength(3);
  });

  it('should validate always return true', async () => {
    const message: Memory = {
      content: { text: 'Add todo' },
    } as any;

    const result = await createTodoAction.validate(mockRuntime, message);
    expect(result).toBe(true);
  });

  it('should create a daily todo successfully', async () => {
    (mockRuntime.useModel as Mock).mockResolvedValue(
      '<response><name>Do 50 pushups</name><description>Daily exercise routine</description><taskType>daily</taskType></response>'
    );
    mockDataService.createTodo.mockResolvedValue('new-todo-id');

    const message: Memory = {
      entityId: 'user-1' as UUID,
      roomId: 'room-1' as UUID,
      content: { text: 'add a daily task to do 50 pushups' },
    } as any;

    await createTodoAction.handler(mockRuntime, message, {} as State, {}, mockCallback);

    expect(mockDataService.createTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Do 50 pushups',
        type: 'daily',
      })
    );

    expect(mockCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('Added new daily task'),
      })
    );
  });

  it('should create a one-off todo with due date', async () => {
    const message: Memory = {
      content: { text: 'Add todo to finish taxes by April 15', source: 'test' },
      roomId: 'room1' as any,
      entityId: 'entity1' as any,
    } as any;

    (mockRuntime.useModel as Mock).mockResolvedValue(`
      <response>
        <name>Finish taxes</name>
        <description>Complete tax filing</description>
        <taskType>one-off</taskType>
        <priority>2</priority>
        <urgent>false</urgent>
        <dueDate>2024-04-15</dueDate>
      </response>
    `);
    mockDataService.createTodo.mockResolvedValue('new-todo-id');

    await createTodoAction.handler(mockRuntime, message, mockState, {}, mockCallback);

    // Verify task was created with correct parameters
    expect(mockDataService.createTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Finish taxes',
        description: 'Complete tax filing',
        type: 'one-off',
        priority: 2,
        isUrgent: false,
        dueDate: expect.any(Date),
        entityId: 'entity1',
        roomId: 'room1',
        worldId: 'world-1', // From room state
        agentId: 'test-agent',
      })
    );

    // Verify success callback
    expect(mockCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringMatching(/Added new one-off task.*Finish taxes.*Priority 2.*Due:/),
        actions: ['CREATE_TODO_SUCCESS'],
        source: 'test',
      })
    );
  });

  it('should create an aspirational todo', async () => {
    const message: Memory = {
      content: { text: 'Add goal to read more books', source: 'test' },
      roomId: 'room1' as any,
      entityId: 'entity1' as any,
    } as any;

    (mockRuntime.useModel as Mock).mockResolvedValue(`
      <response>
        <name>Read more books</name>
        <taskType>aspirational</taskType>
      </response>
    `);
    mockDataService.createTodo.mockResolvedValue('new-todo-id');

    await createTodoAction.handler(mockRuntime, message, mockState, {}, mockCallback);

    // Verify task was created with correct parameters
    expect(mockDataService.createTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Read more books',
        type: 'aspirational',
        entityId: 'entity1',
      })
    );

    // Verify success callback
    expect(mockCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringMatching(/Added new aspirational goal.*Read more books/),
        actions: ['CREATE_TODO_SUCCESS'],
        source: 'test',
      })
    );
  });

  it('should detect and reject duplicate todos', async () => {
    (mockRuntime.useModel as Mock).mockResolvedValue(
      '<response><name>Clean house</name><taskType>one-off</taskType></response>'
    );

    mockDataService.getTodos.mockResolvedValue([{ name: 'Clean house' }]);

    const message: Memory = {
      entityId: 'user-1' as UUID,
      roomId: 'room-1' as UUID,
      content: { text: 'add task to clean house' },
    } as any;

    await createTodoAction.handler(mockRuntime, message, {} as State, {}, mockCallback);

    expect(mockDataService.createTodo).not.toHaveBeenCalled();
    expect(mockCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('already have an active task named "Clean house"'),
        actions: ['CREATE_TODO_DUPLICATE'],
      })
    );
  });

  it('should handle extraction failure gracefully', async () => {
    (mockRuntime.useModel as Mock).mockResolvedValue('<response></response>'); // Empty response

    const message: Memory = {
      entityId: 'user-1' as UUID,
      roomId: 'room-1' as UUID,
      content: { text: 'add a task' },
    } as any;

    await createTodoAction.handler(mockRuntime, message, {} as State, {}, mockCallback);

    expect(mockDataService.createTodo).not.toHaveBeenCalled();
    expect(mockCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "I couldn't understand the details of the todo you want to create. Could you please provide more information?",
      })
    );
  });

  it('should handle confirmation messages without creating todo', async () => {
    const message: Memory = {
      content: { text: 'yes', source: 'test' },
      roomId: 'room1' as any,
      entityId: 'entity1' as any,
    } as any;

    (mockRuntime.useModel as Mock).mockResolvedValue(`
      <response>
        <is_confirmation>true</is_confirmation>
      </response>
    `);

    await createTodoAction.handler(mockRuntime, message, mockState, {}, mockCallback);

    // Verify no task was created
    expect(mockDataService.createTodo).not.toHaveBeenCalled();

    // Verify informational callback. It should fail to extract and give the generic error.
    expect(mockCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "I couldn't understand the details of the todo you want to create. Could you please provide more information?",
        actions: ['CREATE_TODO_FAILED'],
      })
    );
  });

  it('should handle dataService create failure', async () => {
    const message: Memory = {
      content: { text: 'Add task to test failure', source: 'test' },
      roomId: 'room1' as any,
      entityId: 'entity1' as any,
    } as any;

    (mockRuntime.useModel as Mock).mockResolvedValue(`
      <response>
        <name>Test failure</name>
        <taskType>one-off</taskType>
      </response>
    `);

    mockDataService.createTodo.mockRejectedValue(new Error('DB Error'));

    await createTodoAction.handler(mockRuntime, message, mockState, {}, mockCallback);

    // Verify error callback
    expect(mockCallback).toHaveBeenCalledWith({
      text: 'I encountered an error while creating your todo. Please try again.',
      actions: ['CREATE_TODO_FAILED'],
      source: 'test',
    });
  });

  it('should handle urgent one-off tasks', async () => {
    const message: Memory = {
      content: { text: 'Add urgent task', source: 'test' },
      roomId: 'room1' as any,
      entityId: 'entity1' as any,
    } as any;

    (mockRuntime.useModel as Mock).mockResolvedValue(`
      <response>
        <name>Urgent task</name>
        <taskType>one-off</taskType>
        <priority>1</priority>
        <urgent>true</urgent>
      </response>
    `);
    mockDataService.createTodo.mockResolvedValue('new-todo-id');

    await createTodoAction.handler(mockRuntime, message, mockState, {}, mockCallback);

    // Verify urgent tag was added
    expect(mockDataService.createTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: 1,
        isUrgent: true,
      })
    );
  });

  it('should use default priority when not specified', async () => {
    const message: Memory = {
      content: { text: 'Add task without priority', source: 'test' },
      roomId: 'room1' as any,
      entityId: 'entity1' as any,
    } as any;

    (mockRuntime.useModel as Mock).mockResolvedValue(`
      <response>
        <name>Task without priority</name>
        <taskType>one-off</taskType>
      </response>
    `);
    mockDataService.createTodo.mockResolvedValue('new-todo-id');

    await createTodoAction.handler(mockRuntime, message, mockState, {}, mockCallback);

    // Verify default priority 3 was used (to match prompt and implementation)
    expect(mockDataService.createTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: 3, // Default priority is 3 as per action logic
      })
    );
  });

  it('should handle dataService get failure', async () => {
    (mockRuntime.useModel as Mock).mockResolvedValue(
      '<response><name>Test</name><taskType>one-off</taskType></response>'
    );
    mockDataService.getTodos.mockRejectedValue(new Error('DB Error'));

    const message: Memory = {
      entityId: 'user-1' as UUID,
      roomId: 'room-1' as UUID,
      content: { text: 'add a task' },
    } as any;

    await createTodoAction.handler(mockRuntime, message, {} as State, {}, mockCallback);

    expect(mockCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'I encountered an error while creating your todo. Please try again.',
        actions: ['CREATE_TODO_FAILED'],
      })
    );
  });
});
