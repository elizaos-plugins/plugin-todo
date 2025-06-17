import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { todosProvider } from '../providers/todos';
import type { IAgentRuntime, Memory, State, UUID } from '@elizaos/core';
import { createTodoDataService } from '../services/todoDataService.ts';

vi.mock('../services/todoDataService');

describe('todosProvider', () => {
  let mockRuntime: IAgentRuntime;
  let mockState: State;
  let mockDataService: any;

  beforeEach(() => {
    mockDataService = {
      getUserPoints: vi.fn(),
      getTodos: vi.fn(),
    };
    (createTodoDataService as Mock).mockReturnValue(mockDataService);

    mockRuntime = {
      agentId: 'test-agent' as UUID,
      worldId: 'world-1' as UUID,
      getRoom: vi.fn().mockResolvedValue({ worldId: 'world-1' }),
      db: {} as any,
    } as any;

    mockState = {
      values: {},
      text: '',
      data: {
        room: { id: 'room-1' as UUID, name: 'Test Room', worldId: 'world-1' as UUID },
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should have correct provider properties', () => {
    expect(todosProvider.name).toBe('TODOS');
    expect(todosProvider.description).toBeDefined();
    expect(todosProvider.get).toBeInstanceOf(Function);
  });

  it('should return formatted todos when tasks exist', async () => {
    const mockTodos = [
      {
        id: '1',
        name: 'Daily Task',
        type: 'daily',
        isCompleted: false,
        tags: ['daily'],
        metadata: { streak: 2 },
      },
      {
        id: '2',
        name: 'One-off Task',
        type: 'one-off',
        isCompleted: false,
        priority: 1,
        isUrgent: true,
        dueDate: new Date('2025-06-16T12:00:00.000Z'),
        tags: ['one-off', 'urgent'],
      },
    ];
    mockDataService.getTodos.mockResolvedValue(mockTodos);
    mockDataService.getUserPoints.mockResolvedValue({ currentPoints: 100 });

    const message: Memory = { entityId: 'user-1' as UUID, roomId: 'room-1' as UUID } as any;
    const result = await todosProvider.get(mockRuntime, message, mockState);

    expect(result.text).toContain("User's Todos");
    expect(result.text).toContain('Points: 100');
    expect(result.text).toContain('Daily Task (daily, streak: 2 days)');
    expect(result.text).toContain('One-off Task (P1 🔴 URGENT, due 6/16/2025)');
  });

  it('should return no tasks message when no tasks exist', async () => {
    mockDataService.getTodos.mockResolvedValue([]);
    mockDataService.getUserPoints.mockResolvedValue({ currentPoints: 0 });

    const message: Memory = { entityId: 'user-1' as UUID, roomId: 'room-1' as UUID } as any;
    const result = await todosProvider.get(mockRuntime, message, mockState);

    expect(result.text).toContain('No daily todos.');
    expect(result.text).toContain('No one-off todos.');
    expect(result.text).toContain('No aspirational todos.');
  });

  it('should handle error gracefully', async () => {
    mockDataService.getTodos.mockRejectedValue(new Error('DB Error'));

    const message: Memory = { entityId: 'user-1' as UUID, roomId: 'room-1' as UUID } as any;
    const result = await todosProvider.get(mockRuntime, message, mockState);

    expect(result.text).toContain('Sorry, there was an error retrieving your tasks.');
  });
});
