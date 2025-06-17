import { logger, TestSuite } from '@elizaos/core';
import type { IAgentRuntime } from '@elizaos/core';

export const TodoPluginE2ETestSuite: TestSuite = {
  name: 'Todo Plugin E2E Tests',
  tests: [
    {
      name: 'should verify todo routes are registered',
      fn: async (runtime: IAgentRuntime) => {
        logger.info('Testing todo routes registration');

        // The routes should be available through the plugin
        const routes = (runtime as any).routes;

        if (!routes) {
          throw new Error('Routes not found on runtime');
        }

        // Check for /api/todos route
        const todoRoute = routes.find((r: any) => r.path === '/api/todos');
        if (!todoRoute) {
          throw new Error('Todo route /api/todos not found');
        }

        // Check for /api/tags route
        const tagsRoute = routes.find((r: any) => r.path === '/api/tags');
        if (!tagsRoute) {
          throw new Error('Tags route /api/tags not found');
        }

        logger.info('✓ All todo routes are registered');
      },
    },
    {
      name: 'should verify todo actions are available',
      fn: async (runtime: IAgentRuntime) => {
        logger.info('Testing todo actions availability');

        const actions = runtime.actions;

        if (!actions) {
          throw new Error('Actions not found on runtime');
        }

        // Check for required actions
        const requiredActions = ['CREATE_TODO', 'COMPLETE_TODO', 'UPDATE_TODO', 'CANCEL_TODO'];
        const availableActionNames = actions.map((a) => a.name);

        for (const actionName of requiredActions) {
          if (!availableActionNames.includes(actionName)) {
            throw new Error(`Required action ${actionName} not found`);
          }
        }

        logger.info('✓ All todo actions are available');
      },
    },
    {
      name: 'should verify todo provider is available',
      fn: async (runtime: IAgentRuntime) => {
        logger.info('Testing todo provider availability');

        const providers = runtime.providers;

        if (!providers) {
          throw new Error('Providers not found on runtime');
        }

        const todoProvider = providers.find((p) => p.name === 'TODOS');
        if (!todoProvider) {
          throw new Error('TODOS provider not found');
        }

        logger.info('✓ Todo provider is available');
      },
    },
    {
      name: 'should verify TodoReminderService is available',
      fn: async (runtime: IAgentRuntime) => {
        logger.info('Testing TodoReminderService availability');

        // Check if the service type is registered
        const services = (runtime as any).services;

        if (!services || !Array.isArray(services)) {
          throw new Error('Services not found on runtime');
        }

        const reminderService = services.find(
          (s: any) => s.serviceType === 'TODO_REMINDER' || s.name === 'TodoReminderService'
        );

        if (!reminderService) {
          throw new Error('TodoReminderService not found');
        }

        logger.info('✓ TodoReminderService is available');
      },
    },
    {
      name: 'should create and complete a todo',
      fn: async (runtime: IAgentRuntime) => {
        logger.info('Testing todo creation and completion flow');

        // This is a placeholder for a more complex integration test
        // In a real scenario, this would:
        // 1. Create a todo using the CREATE_TODO action
        // 2. Verify it was created
        // 3. Complete it using COMPLETE_TODO action
        // 4. Verify it was completed

        // For now, just verify the data service can be created
        const { createTodoDataService } = await import('../../services/todoDataService');

        try {
          const dataService = createTodoDataService(runtime);
          if (!dataService) {
            throw new Error('Failed to create todo data service');
          }
          logger.info('✓ Todo data service created successfully');
        } catch (error) {
          throw new Error(
            `Failed to create data service: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      },
    },
  ],
};
