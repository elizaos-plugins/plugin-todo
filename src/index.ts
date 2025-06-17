import type { Plugin } from '@elizaos/core';
import { type IAgentRuntime, logger, type ServiceTypeName } from '@elizaos/core';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';

import { routes } from './apis';

// Import actions
import { cancelTodoAction } from './actions/cancelTodo';
import { completeTodoAction } from './actions/completeTodo';
import { createTodoAction } from './actions/createTodo';
import { updateTodoAction } from './actions/updateTodo';

// Import providers
import { todosProvider } from './providers/todos';

// Import services
import { TodoReminderService } from './services/reminderService';

// Import schema
import { todoSchema } from './schema';
import { createTodoDataService } from './services/todoDataService';

// Import tests
import { TodoPluginE2ETestSuite } from './tests';

/**
 * The TodoPlugin provides task management functionality with daily recurring and one-off tasks,
 * including creating, completing, updating, and deleting tasks, as well as a point system for
 * task completion.
 */
export const TodoPlugin: Plugin = {
  name: 'todo',
  description: 'Provides task management functionality with daily recurring and one-off tasks.',
  providers: [todosProvider],
  testDependencies: ['@elizaos/plugin-sql'],
  actions: [createTodoAction, completeTodoAction, updateTodoAction, cancelTodoAction],
  services: [TodoReminderService],
  routes,
  schema: todoSchema,
  tests: [TodoPluginE2ETestSuite],

  async init(config: Record<string, string>, runtime: IAgentRuntime): Promise<void> {
    logger.info('TodoPlugin initialized');

    // Setup daily task reset for recurring tasks
    const worldId = runtime.getSetting('WORLD_ID');
    if (!worldId) {
      logger.warn('TodoPlugin: No WORLD_ID found, skipping daily task reset setup');
      return;
    }

    // Register the task worker
    runtime.registerTaskWorker({
      name: 'RESET_DAILY_TASKS',
      validate: async () => true,
      execute: async (runtime: IAgentRuntime) => {
        logger.info('Executing daily task reset');
        try {
          const dataService = createTodoDataService(runtime);
          const count = await dataService.resetDailyTodos(runtime.agentId);
          logger.info(`Reset ${count} daily tasks.`);
        } catch (error) {
          logger.error('Error resetting daily tasks:', error);
        }
      },
    });

    // Check if the recurring task already exists to trigger the worker
    const existingTasks = await runtime.getTasks({
      tags: ['system', 'recurring-daily', 'RESET_DAILY_TASKS'],
    });

    if (existingTasks.length === 0) {
      const resetTaskId = await runtime.createTask({
        name: 'RESET_DAILY_TASKS',
        description: 'Resets all completed daily todos at the start of each day',
        tags: ['system', 'recurring-daily', 'RESET_DAILY_TASKS'],
        metadata: {
          updateInterval: 24 * 60 * 60 * 1000, // 24 hours
        },
      });
      logger.info(`TodoPlugin: Daily task reset scheduled with id: ${resetTaskId}`);
    } else {
      logger.info('Daily task reset task already exists.');
    }
  },
};

export default TodoPlugin;
