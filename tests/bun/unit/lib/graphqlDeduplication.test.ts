/* tests/bun/unit/lib/graphqlDeduplication.test.ts */
import { describe, expect, test } from "bun:test";
import {
  countDuplicates,
  createDeduplicator,
  deduplicateByFields,
  deduplicateById,
  deduplicateEdges,
  deduplicateResults,
  deduplicateWithMerge,
  deduplicateWithStats,
  findDuplicates,
  hasDuplicates,
  mergeAndDeduplicate,
  stableDeduplicateById,
} from "../../../../src/lib/graphqlDeduplication";

// -- Shared test data --

interface TestItem {
  id: string;
  name: string;
  value: number;
}

interface TestEdge {
  node: { id: string };
  cursor: string;
}

const makeItem = (id: string, name: string, value: number): TestItem => ({ id, name, value });
const makeEdge = (id: string, cursor: string): TestEdge => ({ node: { id }, cursor });

// -- deduplicateResults --

describe("deduplicateResults", () => {
  test("empty array returns empty", () => {
    expect(deduplicateResults([])).toEqual([]);
  });

  test("single item returns same", () => {
    const items = [makeItem("1", "a", 10)];
    expect(deduplicateResults(items)).toEqual(items);
  });

  test("removes deep-equal duplicates", () => {
    const items = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 1, y: 2 },
    ];
    const result = deduplicateResults(items);
    expect(result).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });

  test("preserves first occurrence", () => {
    const first = { id: "1", label: "first" };
    const second = { id: "1", label: "second" };
    // These are not deep-equal (different label), so both stay.
    // Use keyFn to test first-occurrence semantics.
    const result = deduplicateResults([first, second], {
      keyFn: (item) => item.id,
    });
    expect(result).toEqual([first]);
  });

  test("respects limit option", () => {
    const items = [
      { v: 1 },
      { v: 2 },
      { v: 3 },
      { v: 4 },
      { v: 5 },
    ];
    const result = deduplicateResults(items, { limit: 3 });
    expect(result).toHaveLength(3);
    expect(result).toEqual([{ v: 1 }, { v: 2 }, { v: 3 }]);
  });

  test("works with keyFn", () => {
    const items = [
      makeItem("1", "a", 10),
      makeItem("2", "b", 20),
      makeItem("1", "a-dup", 30),
    ];
    const result = deduplicateResults(items, { keyFn: (i) => i.id });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("a");
    expect(result[1].name).toBe("b");
  });

  test("handles mixed primitive types via deep equality", () => {
    const items = [1, "1", 1, true, "1", true];
    const result = deduplicateResults(items);
    expect(result).toEqual([1, "1", true]);
  });

  test("handles nested object duplicates", () => {
    const items = [
      { a: { b: { c: 1 } } },
      { a: { b: { c: 2 } } },
      { a: { b: { c: 1 } } },
    ];
    const result = deduplicateResults(items);
    expect(result).toHaveLength(2);
  });
});

// -- deduplicateByFields --

describe("deduplicateByFields", () => {
  test("deduplicates by single field", () => {
    const items = [
      { name: "alice", age: 30 },
      { name: "bob", age: 25 },
      { name: "alice", age: 35 },
    ];
    const result = deduplicateByFields(items, ["name"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "alice", age: 30 });
    expect(result[1]).toEqual({ name: "bob", age: 25 });
  });

  test("deduplicates by multiple fields", () => {
    const items = [
      { name: "alice", department: "eng", role: "lead" },
      { name: "alice", department: "sales", role: "rep" },
      { name: "alice", department: "eng", role: "senior" },
    ];
    const result = deduplicateByFields(items, ["name", "department"]);
    expect(result).toHaveLength(2);
    expect(result[0].department).toBe("eng");
    expect(result[1].department).toBe("sales");
  });

  test("preserves first occurrence", () => {
    const items = [
      { code: "X", value: "first" },
      { code: "X", value: "second" },
    ];
    const result = deduplicateByFields(items, ["code"]);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("first");
  });

  test("respects limit", () => {
    const items = [
      { id: "1", v: 1 },
      { id: "2", v: 2 },
      { id: "3", v: 3 },
      { id: "4", v: 4 },
    ];
    const result = deduplicateByFields(items, ["id"], { limit: 2 });
    expect(result).toHaveLength(2);
  });
});

// -- deduplicateById --

describe("deduplicateById", () => {
  test("deduplicates by id field", () => {
    const items = [
      makeItem("1", "a", 10),
      makeItem("2", "b", 20),
      makeItem("1", "a-dup", 30),
      makeItem("3", "c", 40),
      makeItem("2", "b-dup", 50),
    ];
    const result = deduplicateById(items);
    expect(result).toHaveLength(3);
    expect(result.map((i) => i.id)).toEqual(["1", "2", "3"]);
  });

  test("preserves order (first occurrence wins)", () => {
    const items = [
      makeItem("3", "third", 30),
      makeItem("1", "first", 10),
      makeItem("2", "second", 20),
      makeItem("1", "first-dup", 99),
    ];
    const result = deduplicateById(items);
    expect(result.map((i) => i.id)).toEqual(["3", "1", "2"]);
    expect(result.find((i) => i.id === "1")?.name).toBe("first");
  });

  test("respects limit", () => {
    const items = [
      makeItem("1", "a", 10),
      makeItem("2", "b", 20),
      makeItem("3", "c", 30),
    ];
    const result = deduplicateById(items, { limit: 2 });
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(["1", "2"]);
  });

  test("works with number ids", () => {
    const items = [
      { id: 1, label: "one" },
      { id: 2, label: "two" },
      { id: 1, label: "one-dup" },
    ];
    const result = deduplicateById(items);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("one");
  });
});

// -- mergeAndDeduplicate --

describe("mergeAndDeduplicate", () => {
  test("merges and deduplicates multiple arrays", () => {
    const a = [makeItem("1", "a", 10), makeItem("2", "b", 20)];
    const b = [makeItem("2", "b-dup", 25), makeItem("3", "c", 30)];
    const result = mergeAndDeduplicate([a, b], { keyFn: (i) => i.id });
    expect(result).toHaveLength(3);
    expect(result.map((i) => i.id)).toEqual(["1", "2", "3"]);
    // First occurrence from array "a" is preserved for id "2"
    expect(result.find((i) => i.id === "2")?.name).toBe("b");
  });

  test("handles empty arrays", () => {
    expect(mergeAndDeduplicate([])).toEqual([]);
    expect(mergeAndDeduplicate([[], []])).toEqual([]);
  });

  test("single array passthrough", () => {
    const items = [makeItem("1", "a", 10)];
    const result = mergeAndDeduplicate([items]);
    expect(result).toEqual(items);
  });
});

// -- deduplicateWithMerge --

describe("deduplicateWithMerge", () => {
  test("merges conflicts using merge function", () => {
    const items = [
      { id: "1", score: 10 },
      { id: "2", score: 20 },
      { id: "1", score: 30 },
      { id: "1", score: 5 },
    ];
    const result = deduplicateWithMerge(
      items,
      (i) => i.id,
      (existing, incoming) => ({
        id: existing.id,
        score: existing.score + incoming.score,
      })
    );
    expect(result).toHaveLength(2);
    expect(result.find((i) => i.id === "1")?.score).toBe(45); // 10 + 30 + 5
    expect(result.find((i) => i.id === "2")?.score).toBe(20);
  });

  test("preserves non-conflicts unchanged", () => {
    const items = [
      { id: "1", v: "a" },
      { id: "2", v: "b" },
      { id: "3", v: "c" },
    ];
    const result = deduplicateWithMerge(
      items,
      (i) => i.id,
      (existing, _incoming) => existing
    );
    expect(result).toHaveLength(3);
    expect(result).toEqual(items);
  });

  test("merge function receives existing and incoming in correct order", () => {
    const items = [
      { id: "1", tag: "first" },
      { id: "1", tag: "second" },
    ];
    const result = deduplicateWithMerge(
      items,
      (i) => i.id,
      (existing, incoming) => ({
        id: existing.id,
        tag: `${existing.tag}+${incoming.tag}`,
      })
    );
    expect(result[0].tag).toBe("first+second");
  });
});

// -- findDuplicates --

describe("findDuplicates", () => {
  test("returns only duplicate items", () => {
    const items = [
      makeItem("1", "a", 10),
      makeItem("2", "b", 20),
      makeItem("1", "a-dup", 30),
      makeItem("3", "c", 40),
      makeItem("1", "a-dup2", 50),
    ];
    const result = findDuplicates(items, (i) => i.id);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("a-dup");
    expect(result[1].name).toBe("a-dup2");
  });

  test("returns empty array for no duplicates", () => {
    const items = [
      makeItem("1", "a", 10),
      makeItem("2", "b", 20),
      makeItem("3", "c", 30),
    ];
    const result = findDuplicates(items, (i) => i.id);
    expect(result).toEqual([]);
  });

  test("works without keyFn (uses deep hash)", () => {
    const items = [1, 2, 3, 2, 1];
    const result = findDuplicates(items);
    expect(result).toHaveLength(2);
    expect(result).toContain(2);
    expect(result).toContain(1);
  });

  test("returns empty for empty input", () => {
    expect(findDuplicates([])).toEqual([]);
  });
});

// -- countDuplicates --

describe("countDuplicates", () => {
  test("counts per unique key", () => {
    const items = [
      makeItem("1", "a", 10),
      makeItem("2", "b", 20),
      makeItem("1", "a", 30),
      makeItem("1", "a", 40),
      makeItem("2", "b", 50),
    ];
    const counts = countDuplicates(items, (i) => i.id);
    expect(counts.get("1")).toBe(3);
    expect(counts.get("2")).toBe(2);
  });

  test("all unique items have count 1", () => {
    const items = [
      makeItem("1", "a", 10),
      makeItem("2", "b", 20),
      makeItem("3", "c", 30),
    ];
    const counts = countDuplicates(items, (i) => i.id);
    for (const count of counts.values()) {
      expect(count).toBe(1);
    }
    expect(counts.size).toBe(3);
  });

  test("duplicates have count greater than 1", () => {
    const items = ["x", "y", "x", "x", "z", "y"];
    const counts = countDuplicates(items, (i) => i);
    expect(counts.get("x")).toBe(3);
    expect(counts.get("y")).toBe(2);
    expect(counts.get("z")).toBe(1);
  });

  test("works without keyFn", () => {
    const items = [42, 42, 7];
    const counts = countDuplicates(items);
    // Without keyFn, keys are hashed from JSON.stringify
    let maxCount = 0;
    for (const count of counts.values()) {
      maxCount = Math.max(maxCount, count);
    }
    expect(maxCount).toBe(2);
  });
});

// -- hasDuplicates --

describe("hasDuplicates", () => {
  test("returns false for unique items", () => {
    const items = [
      makeItem("1", "a", 10),
      makeItem("2", "b", 20),
      makeItem("3", "c", 30),
    ];
    expect(hasDuplicates(items, (i) => i.id)).toBe(false);
  });

  test("returns true for duplicates", () => {
    const items = [
      makeItem("1", "a", 10),
      makeItem("2", "b", 20),
      makeItem("1", "a-dup", 30),
    ];
    expect(hasDuplicates(items, (i) => i.id)).toBe(true);
  });

  test("works with keyFn on primitives", () => {
    expect(hasDuplicates(["a", "b", "c"], (i) => i)).toBe(false);
    expect(hasDuplicates(["a", "b", "a"], (i) => i)).toBe(true);
  });

  test("returns false for empty array", () => {
    expect(hasDuplicates([])).toBe(false);
  });

  test("returns false for single item", () => {
    expect(hasDuplicates([makeItem("1", "a", 10)], (i) => i.id)).toBe(false);
  });

  test("works without keyFn", () => {
    expect(hasDuplicates([1, 2, 3])).toBe(false);
    expect(hasDuplicates([1, 2, 1])).toBe(true);
  });
});

// -- deduplicateEdges --

describe("deduplicateEdges", () => {
  test("deduplicates by node.id", () => {
    const edges: TestEdge[] = [
      makeEdge("n1", "c1"),
      makeEdge("n2", "c2"),
      makeEdge("n1", "c3"),
      makeEdge("n3", "c4"),
    ];
    const result = deduplicateEdges(edges);
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.node.id)).toEqual(["n1", "n2", "n3"]);
  });

  test("preserves first edge occurrence", () => {
    const edges: TestEdge[] = [
      makeEdge("n1", "cursor-first"),
      makeEdge("n1", "cursor-second"),
    ];
    const result = deduplicateEdges(edges);
    expect(result).toHaveLength(1);
    expect(result[0].cursor).toBe("cursor-first");
  });

  test("respects limit option", () => {
    const edges: TestEdge[] = [
      makeEdge("n1", "c1"),
      makeEdge("n2", "c2"),
      makeEdge("n3", "c3"),
    ];
    const result = deduplicateEdges(edges, { limit: 2 });
    expect(result).toHaveLength(2);
  });

  test("handles empty edges array", () => {
    const result = deduplicateEdges([]);
    expect(result).toEqual([]);
  });
});

// -- createDeduplicator --

describe("createDeduplicator", () => {
  test("returns a reusable function", () => {
    const dedup = createDeduplicator<TestItem>({ keyFn: (i) => i.id });
    expect(typeof dedup).toBe("function");

    const items1 = [makeItem("1", "a", 10), makeItem("1", "a-dup", 20)];
    const items2 = [makeItem("2", "b", 30), makeItem("2", "b-dup", 40)];

    expect(dedup(items1)).toHaveLength(1);
    expect(dedup(items2)).toHaveLength(1);
  });

  test("applies options consistently", () => {
    const dedup = createDeduplicator<TestItem>({
      keyFn: (i) => i.id,
      limit: 2,
    });

    const items = [
      makeItem("1", "a", 10),
      makeItem("2", "b", 20),
      makeItem("3", "c", 30),
    ];
    const result = dedup(items);
    expect(result).toHaveLength(2);
  });

  test("works without options (deep equality)", () => {
    const dedup = createDeduplicator<{ x: number }>();
    const items = [{ x: 1 }, { x: 2 }, { x: 1 }];
    const result = dedup(items);
    expect(result).toHaveLength(2);
  });
});

// -- deduplicateWithStats --

describe("deduplicateWithStats", () => {
  test("returns correct stats", () => {
    const items = [
      makeItem("1", "a", 10),
      makeItem("2", "b", 20),
      makeItem("1", "a-dup", 30),
      makeItem("3", "c", 40),
      makeItem("2", "b-dup", 50),
    ];
    const { results, stats } = deduplicateWithStats(items, {
      keyFn: (i) => i.id,
    });

    expect(results).toHaveLength(3);
    expect(stats.inputCount).toBe(5);
    expect(stats.outputCount).toBe(3);
    expect(stats.duplicatesRemoved).toBe(2);
    expect(stats.deduplicationRate).toBeCloseTo(0.4); // 2/5
  });

  test("handles empty array with rate 0", () => {
    const { results, stats } = deduplicateWithStats([]);

    expect(results).toEqual([]);
    expect(stats.inputCount).toBe(0);
    expect(stats.outputCount).toBe(0);
    expect(stats.duplicatesRemoved).toBe(0);
    expect(stats.deduplicationRate).toBe(0);
  });

  test("all unique items yields rate 0", () => {
    const items = [makeItem("1", "a", 10), makeItem("2", "b", 20)];
    const { stats } = deduplicateWithStats(items, { keyFn: (i) => i.id });

    expect(stats.inputCount).toBe(2);
    expect(stats.outputCount).toBe(2);
    expect(stats.duplicatesRemoved).toBe(0);
    expect(stats.deduplicationRate).toBe(0);
  });

  test("all duplicates yields high deduplication rate", () => {
    const items = [
      makeItem("1", "a", 10),
      makeItem("1", "b", 20),
      makeItem("1", "c", 30),
      makeItem("1", "d", 40),
    ];
    const { stats } = deduplicateWithStats(items, { keyFn: (i) => i.id });

    expect(stats.inputCount).toBe(4);
    expect(stats.outputCount).toBe(1);
    expect(stats.duplicatesRemoved).toBe(3);
    expect(stats.deduplicationRate).toBeCloseTo(0.75); // 3/4
  });
});

// -- stableDeduplicateById --

describe("stableDeduplicateById", () => {
  test("maintains insertion order", () => {
    const items = [
      makeItem("3", "third", 30),
      makeItem("1", "first", 10),
      makeItem("2", "second", 20),
    ];
    const result = stableDeduplicateById(items);
    expect(result.map((i) => i.id)).toEqual(["3", "1", "2"]);
  });

  test("removes later duplicates, keeps first", () => {
    const items = [
      makeItem("1", "first-1", 10),
      makeItem("2", "first-2", 20),
      makeItem("1", "dup-1", 30),
      makeItem("3", "first-3", 40),
      makeItem("2", "dup-2", 50),
      makeItem("1", "dup-1-again", 60),
    ];
    const result = stableDeduplicateById(items);
    expect(result).toHaveLength(3);
    expect(result.map((i) => i.id)).toEqual(["1", "2", "3"]);
    expect(result[0].name).toBe("first-1");
    expect(result[1].name).toBe("first-2");
    expect(result[2].name).toBe("first-3");
  });

  test("handles single item", () => {
    const items = [makeItem("1", "only", 10)];
    expect(stableDeduplicateById(items)).toEqual(items);
  });

  test("handles empty array", () => {
    const items: TestItem[] = [];
    expect(stableDeduplicateById(items)).toEqual([]);
  });

  test("works with number ids", () => {
    const items = [
      { id: 100, v: "a" },
      { id: 200, v: "b" },
      { id: 100, v: "c" },
    ];
    const result = stableDeduplicateById(items);
    expect(result).toHaveLength(2);
    expect(result[0].v).toBe("a");
    expect(result[1].v).toBe("b");
  });
});
