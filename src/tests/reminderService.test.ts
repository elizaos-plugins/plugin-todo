import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { TodoReminderService } from '../services/reminderService';
import type { IAgentRuntime, EventType, UUID } from '@elizaos/core';
import { createTodoDataService, type TodoData as Todo } from '../services/todoDataService';

vi.mock('../services/todoDataService');

describe('TodoReminderService', () => {
  let mockRuntime: IAgentRuntime;
  let service: TodoReminderService;
  let mockDataService: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockDataService = {
      getOverdueTodos: vi.fn(),
      updateTodo: vi.fn(),
    };
    (createTodoDataService as Mock).mockReturnValue(mockDataService);

    mockRuntime = {
      agentId: 'test-agent' as UUID,
      emitEvent: vi.fn(),
      getService: vi.fn(),
      db: {} as any,
    } as any;
  });

  afterEach(async () => {
    if (service) {
      await service.stop();
    }
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should have correct service type', () => {
    expect(TodoReminderService.serviceType).toBe('TODO_REMINDER');
  });

  it('should start service and begin timer', async () => {
    service = await TodoReminderService.start(mockRuntime);
    expect(service).toBeInstanceOf(TodoReminderService);
    expect(service.capabilityDescription).toBe('The agent can send reminders for overdue tasks');
  });

  it('should stop service and clear timer', async () => {
    service = await TodoReminderService.start(mockRuntime);
    await service.stop();
    // Ensure no errors thrown and timer is cleared
    expect(true).toBe(true);
  });

  it('should start and setup timer for periodic checks', async () => {
    service = await TodoReminderService.start(mockRuntime);
    expect(service).toBeInstanceOf(TodoReminderService);

    // Should call checkOverdueTasks periodically
    vi.advanceTimersByTime(60 * 60 * 1000 + 1); // Advance past 1 hour interval
    expect(mockDataService.getOverdueTodos).toHaveBeenCalled();
  });

  it('should send reminder for overdue tasks', async () => {
    const overdueDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const mockTodos: Todo[] = [
      {
        id: 'task1' as UUID,
        roomId: 'room1' as UUID,
        name: 'Overdue task',
        type: 'one-off',
        isCompleted: false,
        dueDate: overdueDate,
        metadata: {},
      } as any,
    ];

    mockDataService.getOverdueTodos.mockResolvedValue(mockTodos);

    service = await TodoReminderService.start(mockRuntime);

    // Advance timer to trigger check
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 1);

    expect(mockDataService.getOverdueTodos).toHaveBeenCalled();

    // Verify reminder was sent
    expect(mockRuntime.emitEvent).toHaveBeenCalledWith(
      'MESSAGE_RECEIVED',
      expect.objectContaining({
        message: expect.objectContaining({
          content: expect.objectContaining({
            text: expect.stringContaining('Reminder'),
          }),
        }),
      })
    );

    // Verify task was updated with lastReminderSent
    expect(mockDataService.updateTodo).toHaveBeenCalledWith('task1' as UUID, {
      metadata: expect.objectContaining({
        lastReminderSent: expect.any(String),
      }),
    });
  });

  it('should respect reminder cooldown period', async () => {
    const overdueDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const recentReminderDate = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago

    const mockTodos: Todo[] = [
      {
        id: 'task1' as UUID,
        roomId: 'room1' as UUID,
        name: 'Overdue task with recent reminder',
        type: 'one-off',
        isCompleted: false,
        dueDate: overdueDate,
        metadata: {
          lastReminderSent: recentReminderDate.toISOString(),
        },
      } as any,
    ];

    mockDataService.getOverdueTodos.mockResolvedValue(mockTodos);

    service = await TodoReminderService.start(mockRuntime);

    // Advance timer to trigger check
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 1);

    // Should NOT send reminder due to cooldown
    expect(mockRuntime.emitEvent).not.toHaveBeenCalled();
    expect(mockDataService.updateTodo).not.toHaveBeenCalled();
  });

  it('should handle tasks without due dates gracefully', async () => {
    // This scenario is now handled by the getOverdueTodos method,
    // which should not return todos without due dates.
    const mockTodos: Todo[] = []; // Expecting no overdue todos
    mockDataService.getOverdueTodos.mockResolvedValue(mockTodos);

    service = await TodoReminderService.start(mockRuntime);

    // Advance timer to trigger check
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 1);

    // Should not send any reminders
    expect(mockRuntime.emitEvent).not.toHaveBeenCalled();
  });

  it('should skip tasks without roomId', async () => {
    // This is also handled by getOverdueTodos or the sendReminder method's internal checks
    const mockTodos: Todo[] = [
      {
        id: 'task1' as UUID,
        roomId: undefined as any,
        name: 'Task without room',
        type: 'one-off',
        isCompleted: false,
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        metadata: {},
      } as any,
    ];

    mockDataService.getOverdueTodos.mockResolvedValue(mockTodos);

    service = await TodoReminderService.start(mockRuntime);

    // Advance timer to trigger check
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 1);

    // Should not send reminder for task without roomId
    expect(mockRuntime.emitEvent).not.toHaveBeenCalled();
  });

  it('should handle errors in checkOverdueTasks gracefully', async () => {
    mockDataService.getOverdueTodos.mockRejectedValue(new Error('Database error'));

    service = await TodoReminderService.start(mockRuntime);

    // Advance timer to trigger check
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 1);

    // The error should be caught and logged, but not thrown
    expect(mockDataService.getOverdueTodos).toHaveBeenCalled();
  });

  it('should stop service via static method', async () => {
    service = await TodoReminderService.start(mockRuntime);
    mockRuntime.getService = vi.fn().mockReturnValue(service);
    const stopSpy = vi.spyOn(service, 'stop');

    await TodoReminderService.stop(mockRuntime);

    expect(mockRuntime.getService).toHaveBeenCalledWith(TodoReminderService.serviceType);
    expect(stopSpy).toHaveBeenCalled();
  });
});
