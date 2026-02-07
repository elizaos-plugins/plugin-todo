import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const todosTable = pgTable("todos", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").notNull(),
  worldId: uuid("world_id").notNull(),
  roomId: uuid("room_id").notNull(),
  entityId: uuid("entity_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull(),
  priority: integer("priority").default(4),
  isUrgent: boolean("is_urgent").default(false),
  isCompleted: boolean("is_completed").default(false),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
  metadata: jsonb("metadata").default("{}").notNull(),
});

export const todoTagsTable = pgTable("todo_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  todoId: uuid("todo_id")
    .references(() => todosTable.id, { onDelete: "cascade" })
    .notNull(),
  tag: text("tag").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const todosRelations = relations(todosTable, ({ many }) => ({
  tags: many(todoTagsTable),
}));

export const todoTagsRelations = relations(todoTagsTable, ({ one }) => ({
  todo: one(todosTable, {
    fields: [todoTagsTable.todoId],
    references: [todosTable.id],
  }),
}));

export const todoSchema = {
  todosTable,
  todoTagsTable,
  tables: {
    todos: todosTable,
    todoTags: todoTagsTable,
  },
};

export default todoSchema;
