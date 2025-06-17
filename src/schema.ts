import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  integer,
  index,
  uniqueIndex,
  timestamp,
  boolean,
  jsonb,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Todos table - stores the main todo items
 */
export const todosTable = pgTable(
  'todos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id').notNull(),
    worldId: uuid('world_id').notNull(),
    roomId: uuid('room_id').notNull(),
    entityId: uuid('entity_id').notNull(), // User who created the todo
    name: text('name').notNull(),
    description: text('description'),
    type: text('type').notNull(), // 'daily', 'one-off', 'aspirational'
    priority: integer('priority').default(4), // 1-4, where 1 is highest
    isUrgent: boolean('is_urgent').default(false),
    isCompleted: boolean('is_completed').default(false),
    dueDate: timestamp('due_date'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at')
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at')
      .default(sql`now()`)
      .notNull(),
    metadata: jsonb('metadata').default('{}').notNull(),
  },
  (table) => ({
    agentIdIndex: index('idx_todos_agent').on(table.agentId),
    worldIdIndex: index('idx_todos_world').on(table.worldId),
    roomIdIndex: index('idx_todos_room').on(table.roomId),
    entityIdIndex: index('idx_todos_entity').on(table.entityId),
    typeIndex: index('idx_todos_type').on(table.type),
    completedIndex: index('idx_todos_completed').on(table.isCompleted),
    dueDateIndex: index('idx_todos_due_date').on(table.dueDate),
    createdAtIndex: index('idx_todos_created_at').on(table.createdAt),
  })
);

/**
 * Todo tags table - stores tags associated with todos
 */
export const todoTagsTable = pgTable(
  'todo_tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    todoId: uuid('todo_id')
      .references(() => todosTable.id, {
        onDelete: 'cascade',
      })
      .notNull(),
    tag: text('tag').notNull(),
    createdAt: timestamp('created_at')
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    todoIdIndex: index('idx_todo_tags_todo').on(table.todoId),
    tagIndex: index('idx_todo_tags_tag').on(table.tag),
    uniqueTodoTag: uniqueIndex('unique_todo_tag').on(table.todoId, table.tag),
  })
);

/**
 * User points table - tracks points earned by users
 */
export const userPointsTable = pgTable(
  'user_points',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id').notNull(),
    worldId: uuid('world_id').notNull(),
    roomId: uuid('room_id').notNull(),
    entityId: uuid('entity_id').notNull(), // User who earned the points
    currentPoints: integer('current_points').default(0).notNull(),
    totalPointsEarned: integer('total_points_earned').default(0).notNull(),
    lastPointUpdateReason: text('last_point_update_reason'),
    createdAt: timestamp('created_at')
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at')
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    entityIdIndex: index('idx_points_entity').on(table.entityId),
    worldIdIndex: index('idx_points_world').on(table.worldId),
    roomIdIndex: index('idx_points_room').on(table.roomId),
    uniqueUserPoints: uniqueIndex('unique_user_points').on(
      table.entityId,
      table.worldId,
      table.roomId
    ),
  })
);

/**
 * Point history table - tracks individual point transactions
 */
export const pointHistoryTable = pgTable(
  'point_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userPointsId: uuid('user_points_id')
      .references(() => userPointsTable.id, {
        onDelete: 'cascade',
      })
      .notNull(),
    todoId: uuid('todo_id').references(() => todosTable.id, {
      onDelete: 'set null',
    }),
    points: integer('points').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at')
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    userPointsIdIndex: index('idx_point_history_user').on(table.userPointsId),
    todoIdIndex: index('idx_point_history_todo').on(table.todoId),
    createdAtIndex: index('idx_point_history_created').on(table.createdAt),
  })
);

/**
 * Daily streaks table - tracks streaks for daily todos
 */
export const dailyStreaksTable = pgTable(
  'daily_streaks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    todoId: uuid('todo_id')
      .references(() => todosTable.id, {
        onDelete: 'cascade',
      })
      .notNull(),
    entityId: uuid('entity_id').notNull(),
    currentStreak: integer('current_streak').default(0).notNull(),
    longestStreak: integer('longest_streak').default(0).notNull(),
    lastCompletedDate: timestamp('last_completed_date'),
    createdAt: timestamp('created_at')
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp('updated_at')
      .default(sql`now()`)
      .notNull(),
  },
  (table) => ({
    todoIdIndex: index('idx_streaks_todo').on(table.todoId),
    entityIdIndex: index('idx_streaks_entity').on(table.entityId),
    uniqueTodoStreak: uniqueIndex('unique_todo_streak').on(table.todoId, table.entityId),
  })
);

/**
 * Relations
 */
export const todosRelations = relations(todosTable, ({ many }) => ({
  tags: many(todoTagsTable),
  pointHistory: many(pointHistoryTable),
  streaks: many(dailyStreaksTable),
}));

export const todoTagsRelations = relations(todoTagsTable, ({ one }) => ({
  todo: one(todosTable, {
    fields: [todoTagsTable.todoId],
    references: [todosTable.id],
  }),
}));

export const userPointsRelations = relations(userPointsTable, ({ many }) => ({
  history: many(pointHistoryTable),
}));

export const pointHistoryRelations = relations(pointHistoryTable, ({ one }) => ({
  userPoints: one(userPointsTable, {
    fields: [pointHistoryTable.userPointsId],
    references: [userPointsTable.id],
  }),
  todo: one(todosTable, {
    fields: [pointHistoryTable.todoId],
    references: [todosTable.id],
  }),
}));

export const dailyStreaksRelations = relations(dailyStreaksTable, ({ one }) => ({
  todo: one(todosTable, {
    fields: [dailyStreaksTable.todoId],
    references: [todosTable.id],
  }),
}));

/**
 * Export the complete schema
 */
export const todoSchema = {
  todosTable,
  todoTagsTable,
  userPointsTable,
  pointHistoryTable,
  dailyStreaksTable,
  // Also include the original structure for compatibility
  tables: {
    todos: todosTable,
    todoTags: todoTagsTable,
    userPoints: userPointsTable,
    pointHistory: pointHistoryTable,
    dailyStreaks: dailyStreaksTable,
  },
};

export default todoSchema;
