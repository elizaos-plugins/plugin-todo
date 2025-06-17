import type { IAgentRuntime, UUID } from '@elizaos/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyStreaksTable, todosTable, todoTagsTable } from '../schema.ts';
import { createTodoDataService, TodoDataService } from '../services/todoDataService.ts';

describe('TodoDataService', () => {
  let mockRuntime: IAgentRuntime;
  let service: TodoDataService;
  let mockDb: any;
  let mockThenable: any;

  beforeEach(() => {
    mockThenable = {
      from: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      returning: vi.fn(),
      values: vi.fn(),
      set: vi.fn(),
      then: vi.fn(),
      execute: vi.fn(),
      findFirst: vi.fn(),
      all: vi.fn(),
      $dynamic: vi.fn(),
    };

    mockThenable.from.mockReturnThis();
    mockThenable.where.mockReturnThis();
    mockThenable.orderBy.mockReturnThis();
    mockThenable.limit.mockReturnThis();
    mockThenable.returning.mockReturnThis();
    mockThenable.values.mockReturnThis();
    mockThenable.set.mockReturnThis();
    mockThenable.findFirst.mockReturnThis();
    mockThenable.all.mockReturnThis();
    mockThenable.$dynamic.mockReturnThis();

    mockDb = {
      insert: vi.fn().mockReturnValue(mockThenable),
      select: vi.fn().mockReturnValue(mockThenable),
      update: vi.fn().mockReturnValue(mockThenable),
      delete: vi.fn().mockReturnValue(mockThenable),
      execute: vi.fn(),
    };

    mockRuntime = {
      agentId: 'test-agent' as UUID,
      db: mockDb,
    } as any;

    service = createTodoDataService(mockRuntime);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createTodo', () => {
    it('should create a new todo with tags', async () => {
      const mockTodo = { id: 'todo-1' };
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve([mockTodo]));
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(true));

      const todoId = await service.createTodo({
        agentId: 'agent-1' as UUID,
        worldId: 'world-1' as UUID,
        roomId: 'room-1' as UUID,
        entityId: 'entity-1' as UUID,
        name: 'Test Todo',
        description: 'Test Description',
        type: 'one-off',
        priority: 2,
        isUrgent: true,
        dueDate: new Date('2024-12-31'),
        metadata: { custom: 'data' },
        tags: ['TODO', 'urgent'],
      });

      expect(mockDb.insert).toHaveBeenCalledWith(todosTable);
      expect(mockThenable.values).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalledWith(todoTagsTable);
      expect(todoId).toBe('todo-1');
    });

    it('should create daily todo with streak', async () => {
      const mockTodo = { id: 'daily-todo-1' };
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve([mockTodo]));
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(true));
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(true));

      const todoId = await service.createTodo({
        agentId: 'agent-1' as UUID,
        worldId: 'world-1' as UUID,
        roomId: 'room-1' as UUID,
        entityId: 'entity-1' as UUID,
        name: 'Daily Exercise',
        type: 'daily',
        tags: ['TODO', 'daily'],
      });

      expect(mockDb.insert).toHaveBeenCalledWith(dailyStreaksTable);
      expect(mockThenable.values).toHaveBeenCalledWith(
        expect.objectContaining({
          todoId: 'daily-todo-1',
          entityId: 'entity-1',
        })
      );
      expect(todoId).toBe('daily-todo-1');
    });

    it('should handle creation failure', async () => {
      mockThenable.then.mockImplementationOnce((resolve: any, reject: any) =>
        reject(new Error('DB error'))
      );
      await expect(
        service.createTodo({
          agentId: 'agent-1' as UUID,
          worldId: 'world-1' as UUID,
          roomId: 'room-1' as UUID,
          entityId: 'entity-1' as UUID,
          name: 'Test Todo',
          type: 'one-off',
        })
      ).rejects.toThrow('DB error');
    });
  });

  describe('getTodos', () => {
    it('should get todos with filters', async () => {
      const mockTodos = [
        { id: 'todo-1', name: 'Todo 1', type: 'one-off' },
        { id: 'todo-2', name: 'Todo 2', type: 'daily' },
      ];
      const mockTags = [
        { todoId: 'todo-1', tag: 'TODO' },
        { todoId: 'todo-1', tag: 'urgent' },
        { todoId: 'todo-2', tag: 'TODO' },
        { todoId: 'todo-2', tag: 'daily' },
      ];

      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(mockTodos));
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(mockTags));

      const todos = await service.getTodos({
        entityId: 'entity-1' as UUID,
        type: 'one-off',
        isCompleted: false,
      });

      expect(mockThenable.where).toHaveBeenCalled();
      expect(todos).toHaveLength(2);
      expect(todos[0].tags).toEqual(['TODO', 'urgent']);
      expect(todos[1].tags).toEqual(['TODO', 'daily']);
    });

    it('should filter by tags', async () => {
      const mockTodos = [{ id: 'todo-1', name: 'Todo 1' }];
      const mockTags = [{ todoId: 'todo-1', tag: 'urgent' }];

      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(mockTodos));
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(mockTags));

      const todos = await service.getTodos({
        tags: ['urgent'],
      });

      expect(mockThenable.where).toHaveBeenCalled();
      expect(todos).toHaveLength(1);
      expect(todos[0].id).toBe('todo-1');
      expect(todos[0].tags).toEqual(['urgent']);
    });
  });

  describe('getTodo', () => {
    it('should get a single todo by ID', async () => {
      const mockTodo = { id: 'todo-1', name: 'Test Todo' };
      const mockTags = [
        { todoId: 'todo-1', tag: 'TODO' },
        { todoId: 'todo-1', tag: 'urgent' },
      ];

      mockThenable.then.mockImplementationOnce((resolve: any) => resolve([mockTodo]));
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(mockTags));

      const todo = await service.getTodo('todo-1' as UUID);

      expect(mockThenable.where).toHaveBeenCalled();
      expect(todo).not.toBeNull();
      expect(todo?.id).toBe('todo-1');
      expect(todo?.tags).toHaveLength(2);
      expect(todo?.tags).toContain('TODO');
      expect(todo?.tags).toContain('urgent');
    });

    it('should return null for non-existent todo', async () => {
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve([]));
      const todo = await service.getTodo('non-existent' as UUID);
      expect(todo).toBeNull();
    });
  });

  describe('updateTodo', () => {
    it('should update todo fields', async () => {
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(true));

      const success = await service.updateTodo('todo-1' as UUID, {
        name: 'Updated Name',
        priority: 1,
        isCompleted: true,
        completedAt: new Date(),
      });

      expect(mockThenable.set).toHaveBeenCalled();
      expect(mockThenable.where).toHaveBeenCalled();
      expect(success).toBe(true);
    });

    it('should update tags', async () => {
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(true));
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(true));
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(true));

      const success = await service.updateTodo('todo-1' as UUID, {
        tags: ['TODO', 'high-priority'],
      });

      expect(mockDb.delete).toHaveBeenCalledWith(todoTagsTable);
      expect(mockDb.insert).toHaveBeenCalledWith(todoTagsTable);
      expect(mockThenable.values).toHaveBeenCalledWith([
        { todoId: 'todo-1', tag: 'TODO' },
        { todoId: 'todo-1', tag: 'high-priority' },
      ]);
      expect(success).toBe(true);
    });
  });

  describe('deleteTodo', () => {
    it('should delete a todo', async () => {
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(true));

      const success = await service.deleteTodo('todo-1' as UUID);

      expect(mockThenable.where).toHaveBeenCalled();
      expect(success).toBe(true);
    });
  });

  describe('getUserPoints', () => {
    it('should get user points', async () => {
      const mockPoints = {
        entityId: 'entity-1',
        worldId: 'world-1',
        roomId: 'room-1',
        currentPoints: 100,
        totalPointsEarned: 150,
        lastPointUpdateReason: 'Completed task',
      };

      mockThenable.then.mockImplementationOnce((resolve: any) => resolve([mockPoints]));

      const points = await service.getUserPoints(
        'entity-1' as UUID,
        'world-1' as UUID,
        'room-1' as UUID
      );

      expect(mockThenable.where).toHaveBeenCalled();
      expect(points).not.toBeNull();
      expect(points?.currentPoints).toBe(100);
    });

    it('should return null for user with no points', async () => {
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve([]));
      const points = await service.getUserPoints(
        'entity-1' as UUID,
        'world-1' as UUID,
        'room-1' as UUID
      );
      expect(points).toBeNull();
    });
  });

  describe('addUserPoints', () => {
    it('should add points to existing user', async () => {
      const mockUserPoints = {
        id: 'points-1',
        currentPoints: 100,
        totalPointsEarned: 100,
      };

      mockThenable.then.mockImplementationOnce((resolve: any) => resolve([mockUserPoints]));
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(true));
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(true));

      const newPoints = await service.addUserPoints(
        'entity-1' as UUID,
        'world-1' as UUID,
        'room-1' as UUID,
        'agent-1' as UUID,
        50,
        'Completed daily task',
        'todo-1' as UUID
      );

      expect(mockThenable.set).toHaveBeenCalled();
      expect(newPoints).toBe(150);
    });

    it('should create points record for new user', async () => {
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve([]));
      mockThenable.then.mockImplementationOnce((resolve: any) =>
        resolve([
          {
            id: 'new-points-1',
            currentPoints: 50,
          },
        ])
      );
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(true));

      const newPoints = await service.addUserPoints(
        'entity-1' as UUID,
        'world-1' as UUID,
        'room-1' as UUID,
        'agent-1' as UUID,
        50,
        'First points'
      );

      expect(mockDb.insert).toHaveBeenCalled();
      expect(newPoints).toBe(50);
    });
  });

  describe('streak management', () => {
    it('should get or create streak', async () => {
      const mockStreak = {
        id: 'streak-1',
        todoId: 'todo-1',
        entityId: 'entity-1',
        currentStreak: 5,
        longestStreak: 10,
      };

      mockThenable.then.mockImplementationOnce((resolve: any) => resolve([mockStreak]));

      const streak = await service.getOrCreateStreak('todo-1' as UUID, 'entity-1' as UUID);

      expect(mockThenable.where).toHaveBeenCalled();
      expect(streak.currentStreak).toBe(5);
      expect(streak.longestStreak).toBe(10);
    });

    it('should create new streak if not exists', async () => {
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve([]));
      mockThenable.then.mockImplementationOnce((resolve: any) =>
        resolve([
          {
            id: 'new-streak-1',
            todoId: 'todo-1',
            entityId: 'entity-1',
            currentStreak: 0,
            longestStreak: 0,
          },
        ])
      );

      const streak = await service.getOrCreateStreak('todo-1' as UUID, 'entity-1' as UUID);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(streak.currentStreak).toBe(0);
    });

    it('should increment streak', async () => {
      const mockStreak = {
        id: 'streak-1',
        currentStreak: 5,
        longestStreak: 8,
      };

      mockThenable.then.mockImplementationOnce((resolve: any) => resolve([mockStreak]));
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(true));

      const updatedStreak = await service.updateStreak('todo-1' as UUID, 'entity-1' as UUID, true);

      expect(mockThenable.set).toHaveBeenCalled();
      expect(updatedStreak.currentStreak).toBe(6);
      expect(updatedStreak.longestStreak).toBe(8);
    });

    it('should update longest streak when current exceeds it', async () => {
      const mockStreak = {
        id: 'streak-1',
        currentStreak: 10,
        longestStreak: 10,
      };

      mockThenable.then.mockImplementationOnce((resolve: any) => resolve([mockStreak]));
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(true));

      const updatedStreak = await service.updateStreak('todo-1' as UUID, 'entity-1' as UUID, true);

      expect(mockThenable.set).toHaveBeenCalled();
      expect(updatedStreak.currentStreak).toBe(11);
      expect(updatedStreak.longestStreak).toBe(11);
    });

    it('should reset streak', async () => {
      const mockStreak = {
        id: 'streak-1',
        currentStreak: 5,
        longestStreak: 10,
      };

      mockThenable.then.mockImplementationOnce((resolve: any) => resolve([mockStreak]));
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(true));

      const updatedStreak = await service.updateStreak('todo-1' as UUID, 'entity-1' as UUID, false);

      expect(mockThenable.set).toHaveBeenCalled();
      expect(updatedStreak.currentStreak).toBe(0);
      expect(updatedStreak.longestStreak).toBe(10);
    });
  });

  describe('getOverdueTodos', () => {
    it('should get overdue todos', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const mockTodos = [
        {
          id: 'todo-1',
          name: 'Overdue Task',
          type: 'one-off',
          dueDate: yesterday,
          isCompleted: false,
        },
      ];
      const mockTags = [
        { todoId: 'todo-1', tag: 'TODO' },
        { todoId: 'todo-1', tag: 'urgent' },
      ];

      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(mockTodos));
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve(mockTags));

      const overdueTodos = await service.getOverdueTodos();

      expect(mockThenable.where).toHaveBeenCalled();
      expect(overdueTodos).toHaveLength(1);
      expect(overdueTodos[0].name).toBe('Overdue Task');
    });
  });

  describe('resetDailyTodos', () => {
    it('should reset completed daily todos', async () => {
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve({ count: 3 }));
      const count = await service.resetDailyTodos('agent-1' as UUID);
      expect(count).toBe(3);
    });

    it('should return 0 if no todos to reset', async () => {
      mockThenable.then.mockImplementationOnce((resolve: any) => resolve({ count: 0 }));
      const count = await service.resetDailyTodos('agent-1' as UUID);
      expect(count).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should throw error when database is not available', () => {
      mockRuntime.db = undefined;
      expect(() => createTodoDataService(mockRuntime)).toThrow(
        'Database instance not available on runtime'
      );
    });

    it('should handle database errors gracefully', async () => {
      mockThenable.then.mockImplementationOnce((resolve: any, reject: any) =>
        reject(new Error('Database error'))
      );
      await expect(service.getTodos()).rejects.toThrow('Database error');
    });
  });
});
