/// <reference types="node" />

import {
  createMessageMemory,
  EventType,
  logger,
  Service,
  type IAgentRuntime,
  type MessagePayload,
  type ServiceTypeName,
} from '@elizaos/core';
import { createTodoDataService } from './todoDataService';
import { type TodoData } from './todoDataService';

/**
 * The Todo Reminder Service checks for overdue tasks and sends reminders to users.
 */
export class TodoReminderService extends Service {
  private timer: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour
  private readonly REMINDER_COOLDOWN = 24 * 60 * 60 * 1000; // Remind once per day

  static serviceType: ServiceTypeName = 'TODO_REMINDER' as ServiceTypeName;
  capabilityDescription = 'The agent can send reminders for overdue tasks';

  /**
   * Start the TodoReminderService with the given runtime.
   * @param {IAgentRuntime} runtime - The runtime for the TodoReminderService.
   * @returns {Promise<TodoReminderService>} A promise that resolves with the TodoReminderService instance.
   */
  static async start(runtime: IAgentRuntime): Promise<TodoReminderService> {
    const service = new TodoReminderService(runtime);
    await service.startTimer();
    return service;
  }

  /**
   * Starts a timer that periodically checks for overdue tasks
   */
  private startTimer() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(() => this.checkOverdueTasks(), this.CHECK_INTERVAL);
    logger.info('TodoReminderService timer started.');
  }

  /**
   * Checks for overdue tasks and sends reminders
   */
  private async checkOverdueTasks() {
    try {
      const dataService = createTodoDataService(this.runtime);
      const overdueTodos = await dataService.getOverdueTodos();

      if (!overdueTodos || overdueTodos.length === 0) {
        return;
      }

      const now = Date.now();
      for (const todo of overdueTodos) {
        const lastReminder = todo.metadata?.lastReminderSent;
        if (lastReminder && now - new Date(lastReminder).getTime() < this.REMINDER_COOLDOWN) {
          continue;
        }

        await this.sendReminder(todo);
        await dataService.updateTodo(todo.id, {
          metadata: { ...todo.metadata, lastReminderSent: new Date().toISOString() },
        });
      }
    } catch (error) {
      logger.error('Error checking overdue tasks:', error);
    }
  }

  /**
   * Sends a reminder message for an overdue task
   */
  private async sendReminder(todo: TodoData) {
    if (!todo.roomId || !todo.dueDate) return;

    const reminderText = `📅 Reminder: Your task "${todo.name}" was due on ${todo.dueDate.toLocaleDateString()}.`;
    const reminderMemory = createMessageMemory({
      entityId: this.runtime.agentId,
      agentId: this.runtime.agentId,
      roomId: todo.roomId,
      content: { text: reminderText, source: TodoReminderService.serviceType },
    });

    const payload: MessagePayload = {
      runtime: this.runtime,
      message: reminderMemory,
      source: TodoReminderService.serviceType,
    };
    await this.runtime.emitEvent(EventType.MESSAGE_RECEIVED, payload);
    logger.debug(`Sent reminder for task: ${todo.id}`);
  }

  /**
   * Stops the timer if it is currently running.
   */
  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('TodoReminderService stopped.');
    }
  }

  /**
   * Stops the reminder service in the given agent runtime.
   * @param {IAgentRuntime} runtime - The agent runtime containing the service.
   */
  static async stop(runtime: IAgentRuntime) {
    const service = runtime.getService(TodoReminderService.serviceType);
    if (service) await service.stop();
  }
}
