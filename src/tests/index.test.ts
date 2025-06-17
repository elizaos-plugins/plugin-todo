import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TodoPlugin } from '../index';
import type { IAgentRuntime } from '@elizaos/core';

describe('TodoPlugin', () => {
  it('should export TodoPlugin with correct structure', () => {
    expect(TodoPlugin).toBeDefined();
    expect(TodoPlugin.name).toBe('todo');
    expect(TodoPlugin.description).toBe(
      'Provides task management functionality with daily recurring and one-off tasks.'
    );
    expect(TodoPlugin.providers).toHaveLength(1);
    expect(TodoPlugin.actions).toHaveLength(4);
    expect(TodoPlugin.services).toHaveLength(1);
    expect(TodoPlugin.routes).toBeDefined();
    expect(TodoPlugin.init).toBeInstanceOf(Function);
  });

  it('should have all required actions', () => {
    const actionNames = TodoPlugin.actions?.map((action) => action.name) || [];
    expect(actionNames).toContain('CREATE_TODO');
    expect(actionNames).toContain('COMPLETE_TODO');
    expect(actionNames).toContain('UPDATE_TODO');
    expect(actionNames).toContain('CANCEL_TODO');
  });

  it('should have all required services', () => {
    expect(TodoPlugin.services?.some((s) => s.serviceType === 'TODO_REMINDER')).toBe(true);
  });
});
