import { describe, it, expect, vi, beforeEach, type Mock, afterEach } from 'vitest';
import { TodoPlugin } from '../index';
import type { IAgentRuntime, UUID } from '@elizaos/core';
import { createTodoDataService } from '../services/todoDataService.ts';

vi.mock('../services/todoDataService');

describe('TodoPlugin Initialization', () => {
  let mockRuntime: IAgentRuntime;
  let registeredTaskWorker: any;
  let mockDataService: any;

  beforeEach(() => {
    mockDataService = {
      resetDailyTodos: vi.fn(),
    };
    (createTodoDataService as Mock).mockReturnValue(mockDataService);

    registeredTaskWorker = undefined;

    mockRuntime = {
      agentId: 'test-agent' as UUID,
      getSetting: vi.fn(),
      getTasks: vi.fn().mockResolvedValue([]),
      createTask: vi.fn().mockResolvedValue('reset-task-id'),
      registerTaskWorker: vi.fn().mockImplementation((worker) => {
        registeredTaskWorker = worker;
      }),
      db: {} as any,
    } as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should initialize plugin with WORLD_ID and create reset task if not exists', async () => {
    (mockRuntime.getSetting as Mock).mockReturnValue('test-world-id');
    (mockRuntime.getTasks as Mock).mockResolvedValue([]);

    await TodoPlugin.init?.({}, mockRuntime);

    expect(mockRuntime.getTasks).toHaveBeenCalled();
    expect(mockRuntime.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'RESET_DAILY_TASKS' })
    );
    expect(mockRuntime.registerTaskWorker).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'RESET_DAILY_TASKS' })
    );
  });

  it('should skip creating reset task if it already exists', async () => {
    (mockRuntime.getSetting as Mock).mockReturnValue('test-world-id');
    (mockRuntime.getTasks as Mock).mockResolvedValue([{ id: 'existing-task' }]);

    await TodoPlugin.init?.({}, mockRuntime);

    expect(mockRuntime.getTasks).toHaveBeenCalled();
    expect(mockRuntime.createTask).not.toHaveBeenCalled();
    expect(mockRuntime.registerTaskWorker).toHaveBeenCalled();
  });

  it('should skip initialization without WORLD_ID', async () => {
    (mockRuntime.getSetting as Mock).mockReturnValue(null);

    await TodoPlugin.init?.({}, mockRuntime);

    expect(mockRuntime.getTasks).not.toHaveBeenCalled();
    expect(mockRuntime.createTask).not.toHaveBeenCalled();
    expect(mockRuntime.registerTaskWorker).not.toHaveBeenCalled();
  });

  describe('Daily Task Reset Worker', () => {
    beforeEach(async () => {
      (mockRuntime.getSetting as Mock).mockReturnValue('test-world-id');
      await TodoPlugin.init?.({}, mockRuntime);
    });

    it('should validate task worker', async () => {
      expect(registeredTaskWorker).toBeDefined();
      const isValid = await registeredTaskWorker.validate();
      expect(isValid).toBe(true);
    });

    it('should reset completed daily todos via data service', async () => {
      mockDataService.resetDailyTodos.mockResolvedValue(5);

      const runtime2 = { agentId: 'test-agent-2' as UUID } as any;
      await registeredTaskWorker.execute(runtime2);

      expect(mockDataService.resetDailyTodos).toHaveBeenCalledWith(runtime2.agentId);
    });

    it('should handle no daily tasks gracefully', async () => {
      mockDataService.resetDailyTodos.mockResolvedValue(0);

      const runtime2 = { agentId: 'test-agent-2' as UUID } as any;
      await registeredTaskWorker.execute(runtime2);

      expect(mockDataService.resetDailyTodos).toHaveBeenCalled();
    });

    it('should handle errors in task reset', async () => {
      mockDataService.resetDailyTodos.mockRejectedValue(new Error('Database error'));
      const runtime2 = { agentId: 'test-agent-2' as UUID } as any;

      // Should not throw, just log error internally
      await expect(registeredTaskWorker.execute(runtime2)).resolves.toBeUndefined();
    });
  });
});
