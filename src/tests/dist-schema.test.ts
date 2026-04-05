import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { todoSchema } from "../../dist/index.js";

describe("Todo built package schema", () => {
  it("preserves the dedicated todo schema in dist output", () => {
    expect(getTableConfig(todoSchema.tables.todos).schema).toBe("todo");
    expect(getTableConfig(todoSchema.tables.todoTags).schema).toBe("todo");
  });
});
