import { describe, it, expect } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import {
  todosTable,
  todoTagsTable,
  userPointsTable,
  pointHistoryTable,
  dailyStreaksTable,
  todoSchema,
} from '../schema.ts';

describe('Todo Schema', () => {
  describe('todosTable', () => {
    it('should have all required columns', () => {
      const columns = getTableColumns(todosTable);

      expect(columns.id).toBeDefined();
      expect(columns.agentId).toBeDefined();
      expect(columns.worldId).toBeDefined();
      expect(columns.roomId).toBeDefined();
      expect(columns.entityId).toBeDefined();
      expect(columns.name).toBeDefined();
      expect(columns.description).toBeDefined();
      expect(columns.type).toBeDefined();
      expect(columns.priority).toBeDefined();
      expect(columns.isUrgent).toBeDefined();
      expect(columns.isCompleted).toBeDefined();
      expect(columns.dueDate).toBeDefined();
      expect(columns.completedAt).toBeDefined();
      expect(columns.createdAt).toBeDefined();
      expect(columns.updatedAt).toBeDefined();
      expect(columns.metadata).toBeDefined();
    });

    it('should have correct column types', () => {
      const columns = getTableColumns(todosTable);

      expect(columns.id.dataType).toBe('string');
      expect(columns.name.dataType).toBe('string');
      expect(columns.type.dataType).toBe('string');
      expect(columns.priority.dataType).toBe('number');
      expect(columns.isUrgent.dataType).toBe('boolean');
      expect(columns.isCompleted.dataType).toBe('boolean');
      expect(columns.metadata.dataType).toBe('json');
    });

    it('should have correct defaults', () => {
      const columns = getTableColumns(todosTable);

      expect(columns.priority.default).toBe(4);
      expect(columns.isUrgent.default).toBe(false);
      expect(columns.isCompleted.default).toBe(false);
      expect(columns.metadata.default).toBe('{}');
    });
  });

  describe('todoTagsTable', () => {
    it('should have all required columns', () => {
      const columns = getTableColumns(todoTagsTable);

      expect(columns.id).toBeDefined();
      expect(columns.todoId).toBeDefined();
      expect(columns.tag).toBeDefined();
      expect(columns.createdAt).toBeDefined();
    });

    it('should have foreign key reference to todos', () => {
      const todoIdColumn = getTableColumns(todoTagsTable).todoId;
      expect(todoIdColumn).toBeDefined();
    });
  });

  describe('userPointsTable', () => {
    it('should have all required columns', () => {
      const columns = getTableColumns(userPointsTable);

      expect(columns.id).toBeDefined();
      expect(columns.agentId).toBeDefined();
      expect(columns.worldId).toBeDefined();
      expect(columns.roomId).toBeDefined();
      expect(columns.entityId).toBeDefined();
      expect(columns.currentPoints).toBeDefined();
      expect(columns.totalPointsEarned).toBeDefined();
      expect(columns.lastPointUpdateReason).toBeDefined();
      expect(columns.createdAt).toBeDefined();
      expect(columns.updatedAt).toBeDefined();
    });

    it('should have correct defaults for points', () => {
      const columns = getTableColumns(userPointsTable);

      expect(columns.currentPoints.default).toBe(0);
      expect(columns.totalPointsEarned.default).toBe(0);
    });
  });

  describe('pointHistoryTable', () => {
    it('should have all required columns', () => {
      const columns = getTableColumns(pointHistoryTable);

      expect(columns.id).toBeDefined();
      expect(columns.userPointsId).toBeDefined();
      expect(columns.todoId).toBeDefined();
      expect(columns.points).toBeDefined();
      expect(columns.reason).toBeDefined();
      expect(columns.createdAt).toBeDefined();
    });

    it('should have foreign key references', () => {
      const columns = getTableColumns(pointHistoryTable);
      const userPointsIdColumn = columns.userPointsId;
      const todoIdColumn = columns.todoId;

      expect(userPointsIdColumn).toBeDefined();
      expect(todoIdColumn).toBeDefined();
    });
  });

  describe('dailyStreaksTable', () => {
    it('should have all required columns', () => {
      const columns = getTableColumns(dailyStreaksTable);

      expect(columns.id).toBeDefined();
      expect(columns.todoId).toBeDefined();
      expect(columns.entityId).toBeDefined();
      expect(columns.currentStreak).toBeDefined();
      expect(columns.longestStreak).toBeDefined();
      expect(columns.lastCompletedDate).toBeDefined();
      expect(columns.createdAt).toBeDefined();
      expect(columns.updatedAt).toBeDefined();
    });

    it('should have correct defaults for streaks', () => {
      const columns = getTableColumns(dailyStreaksTable);

      expect(columns.currentStreak.default).toBe(0);
      expect(columns.longestStreak.default).toBe(0);
    });
  });

  describe('todoSchema export', () => {
    it('should export all tables', () => {
      expect(todoSchema.todosTable).toBeDefined();
      expect(todoSchema.todoTagsTable).toBeDefined();
      expect(todoSchema.userPointsTable).toBeDefined();
      expect(todoSchema.pointHistoryTable).toBeDefined();
      expect(todoSchema.dailyStreaksTable).toBeDefined();
    });

    it('should have correct number of tables', () => {
      const tableCount = Object.keys(todoSchema).length;
      expect(tableCount).toBe(5);
    });
  });
});
