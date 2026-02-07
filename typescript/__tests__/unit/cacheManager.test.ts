import type { UUID } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CacheManager } from "../../services/cacheManager";

// Suppress logger output during tests
vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("CacheManager", () => {
  let cache: CacheManager;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new CacheManager(100, 60_000); // max 100 entries, 60s TTL
  });

  afterEach(async () => {
    await cache.stop();
    vi.useRealTimers();
  });

  describe("set and get", () => {
    it("should store and retrieve a value", async () => {
      await cache.set("key1", "value1");
      const value = await cache.get<string>("key1");
      expect(value).toBe("value1");
    });

    it("should store and retrieve complex objects", async () => {
      const data = { name: "Test Todo", priority: 1, tags: ["urgent"] };
      await cache.set("todo:1", data);
      const value = await cache.get<typeof data>("todo:1");
      expect(value).toEqual(data);
    });

    it("should overwrite existing values", async () => {
      await cache.set("key1", "first");
      await cache.set("key1", "second");
      const value = await cache.get<string>("key1");
      expect(value).toBe("second");
    });
  });

  describe("get missing key", () => {
    it("should return null for a key that was never set", async () => {
      const value = await cache.get("nonexistent");
      expect(value).toBeNull();
    });

    it("should return null for an expired key", async () => {
      await cache.set("expiring", "value", 1000); // 1s TTL
      vi.advanceTimersByTime(2000); // advance past TTL
      const value = await cache.get("expiring");
      expect(value).toBeNull();
    });
  });

  describe("delete", () => {
    it("should delete an existing key and return true", async () => {
      await cache.set("key1", "value1");
      const result = await cache.delete("key1");
      expect(result).toBe(true);

      const value = await cache.get("key1");
      expect(value).toBeNull();
    });

    it("should return false when deleting a non-existent key", async () => {
      const result = await cache.delete("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("has", () => {
    it("should return true for an existing non-expired key", async () => {
      await cache.set("key1", "value1");
      const result = await cache.has("key1");
      expect(result).toBe(true);
    });

    it("should return false for a non-existent key", async () => {
      const result = await cache.has("nonexistent");
      expect(result).toBe(false);
    });

    it("should return false for an expired key", async () => {
      await cache.set("expiring", "value", 1000);
      vi.advanceTimersByTime(2000);
      const result = await cache.has("expiring");
      expect(result).toBe(false);
    });
  });

  describe("getOrSet", () => {
    it("should call fetcher on cache miss and store result", async () => {
      const fetcher = vi.fn(async () => "fetched_value");

      const value = await cache.getOrSet("key1", fetcher);
      expect(value).toBe("fetched_value");
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("should return cached value on hit without calling fetcher", async () => {
      const fetcher = vi.fn(async () => "fetched_value");

      // First call – cache miss
      await cache.getOrSet("key1", fetcher);
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Second call – cache hit
      const value = await cache.getOrSet("key1", fetcher);
      expect(value).toBe("fetched_value");
      expect(fetcher).toHaveBeenCalledTimes(1); // still 1
    });

    it("should call fetcher again after TTL expiry", async () => {
      let callCount = 0;
      const fetcher = vi.fn(async () => {
        callCount++;
        return `value_${callCount}`;
      });

      await cache.getOrSet("key1", fetcher, 5000);
      expect(fetcher).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(6000);

      const value = await cache.getOrSet("key1", fetcher, 5000);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(value).toBe("value_2");
    });

    it("should respect custom TTL", async () => {
      const fetcher = vi.fn(async () => "short-lived");

      await cache.getOrSet("key1", fetcher, 500);

      // Still within TTL
      vi.advanceTimersByTime(400);
      const value1 = await cache.getOrSet("key1", fetcher);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(value1).toBe("short-lived");
    });
  });

  describe("stats", () => {
    it("should track totalEntries", async () => {
      expect(cache.getStats().totalEntries).toBe(0);

      await cache.set("a", 1);
      await cache.set("b", 2);
      expect(cache.getStats().totalEntries).toBe(2);
    });

    it("should track hits and misses", async () => {
      await cache.set("key1", "value1");

      await cache.get("key1"); // hit
      await cache.get("key1"); // hit
      await cache.get("missing"); // miss

      const stats = cache.getStats();
      expect(stats.totalHits).toBe(2);
      expect(stats.totalMisses).toBe(1);
    });

    it("should calculate hitRate and missRate", async () => {
      await cache.set("key1", "value1");

      await cache.get("key1"); // hit
      await cache.get("missing"); // miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBeCloseTo(0.5);
      expect(stats.missRate).toBeCloseTo(0.5);
    });

    it("should handle zero requests gracefully", () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
      expect(stats.missRate).toBe(0);
      expect(stats.totalHits).toBe(0);
      expect(stats.totalMisses).toBe(0);
    });

    it("should report memoryUsage greater than zero when entries exist", async () => {
      await cache.set("key1", { data: "some data" });
      const stats = cache.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });

    it("should reset stats on clear", async () => {
      await cache.set("key1", "value1");
      await cache.get("key1");
      await cache.get("missing");

      await cache.clear();

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.totalHits).toBe(0);
      expect(stats.totalMisses).toBe(0);
    });
  });

  describe("LRU eviction", () => {
    it("should evict least-recently-used entry when max size reached", async () => {
      const smallCache = new CacheManager(3, 60_000);

      await smallCache.set("a", 1);
      vi.advanceTimersByTime(10);
      await smallCache.set("b", 2);
      vi.advanceTimersByTime(10);
      await smallCache.set("c", 3);
      vi.advanceTimersByTime(10);

      // Access "a" to make it the most recently used
      await smallCache.get("a");
      vi.advanceTimersByTime(10);

      // Adding "d" should evict "b" (least recently used – set earliest and never re-accessed)
      await smallCache.set("d", 4);

      const stats = smallCache.getStats();
      expect(stats.totalEntries).toBe(3);

      // "a" was accessed most recently, so it should still exist
      expect(await smallCache.get("a")).toBe(1);
      // "d" was just added
      expect(await smallCache.get("d")).toBe(4);
      // "b" should have been evicted
      expect(await smallCache.get("b")).toBeNull();

      await smallCache.stop();
    });
  });

  describe("mget and mset", () => {
    it("should set and get multiple keys at once", async () => {
      const entries = new Map<string, string>([
        ["k1", "v1"],
        ["k2", "v2"],
        ["k3", "v3"],
      ]);

      await cache.mset(entries);

      const results = await cache.mget<string>(["k1", "k2", "k3", "k4"]);
      expect(results.size).toBe(3);
      expect(results.get("k1")).toBe("v1");
      expect(results.get("k2")).toBe("v2");
      expect(results.get("k3")).toBe("v3");
      expect(results.has("k4")).toBe(false);
    });
  });

  describe("pattern operations", () => {
    it("should get entries matching a pattern", async () => {
      await cache.set("todo:1", { name: "Todo 1" });
      await cache.set("todo:2", { name: "Todo 2" });
      await cache.set("entity:1", { name: "Entity 1" });

      const todoEntries = await cache.getByPattern(/^todo:/);
      expect(todoEntries.size).toBe(2);
    });

    it("should delete entries matching a pattern", async () => {
      await cache.set("todo:1", { name: "Todo 1" });
      await cache.set("todo:2", { name: "Todo 2" });
      await cache.set("entity:1", { name: "Entity 1" });

      const deleted = await cache.deleteByPattern(/^todo:/);
      expect(deleted).toBe(2);

      expect(await cache.get("todo:1")).toBeNull();
      expect(await cache.get("entity:1")).not.toBeNull();
    });
  });

  describe("specialized cache methods", () => {
    it("should cache and retrieve entities", async () => {
      const entityId = crypto.randomUUID() as UUID;
      const entity = { id: entityId, name: "Test Entity" };

      await cache.cacheEntity(entityId, entity);
      const cached = await cache.getCachedEntity(entityId);
      expect(cached).toEqual(entity);
    });

    it("should cache and retrieve user behavior", async () => {
      const userId = crypto.randomUUID() as UUID;
      const behavior = { completionRate: 0.85 };

      await cache.cacheUserBehavior(userId, behavior);
      const cached = await cache.getCachedUserBehavior(userId);
      expect(cached).toEqual(behavior);
    });

    it("should cache and retrieve reminder recommendations", async () => {
      const todoId = crypto.randomUUID() as UUID;
      const recommendation = { suggestedTime: "09:00" };

      await cache.cacheReminderRecommendation(todoId, recommendation);
      const cached = await cache.getCachedReminderRecommendation(todoId);
      expect(cached).toEqual(recommendation);
    });

    it("should cache and retrieve service health", async () => {
      const health = { status: "healthy", lastCheck: Date.now() };

      await cache.cacheServiceHealth("TODO_REMINDER", health);
      const cached = await cache.getCachedServiceHealth("TODO_REMINDER");
      expect(cached).toEqual(health);
    });
  });
});
