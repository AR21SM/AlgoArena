/**
 * @file seed.ts
 * @description Seeds the database with 10 real DSA problems with full test cases.
 * Run: bun run db:seed
 */
import { db } from "./index";
import { problems } from "./schema";
import { sql } from "drizzle-orm";

const PROBLEMS = [
    {
        title: "Two Sum",
        difficulty: "easy" as const,
        tags: ["array", "hash-map"],
        description: `Given an array of integers \`nums\` and an integer \`target\`, return indices of the two numbers such that they add up to \`target\`.

You may assume that each input would have exactly one solution, and you may not use the same element twice.`,
        constraints: "2 ≤ nums.length ≤ 10⁴\n-10⁹ ≤ nums[i] ≤ 10⁹\n-10⁹ ≤ target ≤ 10⁹",
        examples: [
            { input: "nums = [2,7,11,15], target = 9", output: "[0,1]", explanation: "nums[0] + nums[1] = 2 + 7 = 9" },
            { input: "nums = [3,2,4], target = 6", output: "[1,2]" },
        ],
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        testCases: [
            { input: "4\n2 7 11 15\n9", output: "0 1" },
            { input: "3\n3 2 4\n6", output: "1 2" },
            { input: "2\n3 3\n6", output: "0 1" },
        ],
        hints: ["Try using a hash map to store seen values.", "For each element, check if target - element is in the map."],
    },
    {
        title: "Valid Parentheses",
        difficulty: "easy" as const,
        tags: ["stack", "string"],
        description: `Given a string \`s\` containing just the characters \`(\`, \`)\`, \`{\`, \`}\`, \`[\` and \`]\`, determine if the input string is valid.

A string is valid if:
- Open brackets must be closed by the same type of brackets.
- Open brackets must be closed in the correct order.
- Every close bracket has a corresponding open bracket.`,
        constraints: "1 ≤ s.length ≤ 10⁴\ns consists of parentheses only '()[]{}'",
        examples: [
            { input: "s = \"()\"", output: "true" },
            { input: "s = \"()[]{}\"", output: "true" },
            { input: "s = \"(]\"", output: "false" },
        ],
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        testCases: [
            { input: "()", output: "true" },
            { input: "()[]{}", output: "true" },
            { input: "(]", output: "false" },
            { input: "([)]", output: "false" },
            { input: "{[]}", output: "true" },
        ],
        hints: ["Use a stack.", "Push open brackets; pop and verify on close brackets."],
    },
    {
        title: "Maximum Subarray",
        difficulty: "medium" as const,
        tags: ["array", "dynamic-programming", "divide-and-conquer"],
        description: `Given an integer array \`nums\`, find the subarray with the largest sum, and return its sum.`,
        constraints: "1 ≤ nums.length ≤ 10⁵\n-10⁴ ≤ nums[i] ≤ 10⁴",
        examples: [
            { input: "nums = [-2,1,-3,4,-1,2,1,-5,4]", output: "6", explanation: "Subarray [4,-1,2,1] has the largest sum = 6." },
            { input: "nums = [1]", output: "1" },
            { input: "nums = [5,4,-1,7,8]", output: "23" },
        ],
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        testCases: [
            { input: "9\n-2 1 -3 4 -1 2 1 -5 4", output: "6" },
            { input: "1\n1", output: "1" },
            { input: "5\n5 4 -1 7 8", output: "23" },
        ],
        hints: ["Kadane's Algorithm: track current and global max.", "Reset current sum when it goes negative."],
    },
    {
        title: "Climbing Stairs",
        difficulty: "easy" as const,
        tags: ["dynamic-programming", "memoization"],
        description: `You are climbing a staircase. It takes \`n\` steps to reach the top.
Each time you can either climb \`1\` or \`2\` steps. In how many distinct ways can you climb to the top?`,
        constraints: "1 ≤ n ≤ 45",
        examples: [
            { input: "n = 2", output: "2", explanation: "Two ways: (1,1) and (2)" },
            { input: "n = 3", output: "3", explanation: "Three ways: (1,1,1), (1,2), (2,1)" },
        ],
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        testCases: [
            { input: "2", output: "2" },
            { input: "3", output: "3" },
            { input: "10", output: "89" },
            { input: "45", output: "1836311903" },
        ],
        hints: ["This is essentially the Fibonacci sequence.", "dp[i] = dp[i-1] + dp[i-2]"],
    },
    {
        title: "Binary Search",
        difficulty: "easy" as const,
        tags: ["binary-search", "array"],
        description: `Given an array of integers \`nums\` which is sorted in ascending order, and an integer \`target\`, write a function to search \`target\` in \`nums\`. If \`target\` exists, return its index. Otherwise, return \`-1\`.

You must write an algorithm with O(log n) runtime complexity.`,
        constraints: "1 ≤ nums.length ≤ 10⁴\n-10⁴ < nums[i], target < 10⁴\nAll integers in nums are unique\nnums is sorted in ascending order",
        examples: [
            { input: "nums = [-1,0,3,5,9,12], target = 9", output: "4", explanation: "9 exists at index 4" },
            { input: "nums = [-1,0,3,5,9,12], target = 2", output: "-1" },
        ],
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        testCases: [
            { input: "6\n-1 0 3 5 9 12\n9", output: "4" },
            { input: "6\n-1 0 3 5 9 12\n2", output: "-1" },
        ],
        hints: ["Use left/right pointers.", "mid = left + (right - left) / 2 to avoid overflow."],
    },
    {
        title: "Merge Two Sorted Lists",
        difficulty: "easy" as const,
        tags: ["linked-list", "recursion"],
        description: `You are given the heads of two sorted linked lists \`list1\` and \`list2\`.
Merge the two lists into one sorted list. The list should be made by splicing together the nodes of the first two lists.
Return the head of the merged linked list.`,
        constraints: "0 ≤ Length ≤ 50\n-100 ≤ Node.val ≤ 100\nBoth lists are sorted in non-decreasing order",
        examples: [
            { input: "list1 = [1,2,4], list2 = [1,3,4]", output: "[1,1,2,3,4,4]" },
            { input: "list1 = [], list2 = []", output: "[]" },
        ],
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        testCases: [
            { input: "3\n1 2 4\n3\n1 3 4", output: "1 1 2 3 4 4" },
            { input: "0\n\n0\n", output: "" },
        ],
        hints: ["Use a dummy head node.", "Compare heads of both lists and advance the smaller one."],
    },
    {
        title: "Number of Islands",
        difficulty: "medium" as const,
        tags: ["bfs", "dfs", "union-find", "matrix"],
        description: `Given an \`m x n\` 2D binary grid \`grid\` which represents a map of \`'1'\`s (land) and \`'0'\`s (water), return the number of islands.

An island is surrounded by water and is formed by connecting adjacent lands horizontally or vertically.`,
        constraints: "m == grid.length\nn == grid[i].length\n1 ≤ m, n ≤ 300\ngrid[i][j] is '0' or '1'",
        examples: [
            {
                input: `grid = [
  ["1","1","1","1","0"],
  ["1","1","0","1","0"],
  ["1","1","0","0","0"],
  ["0","0","0","0","0"]
]`,
                output: "1",
            },
        ],
        timeLimitMs: 2000,
        memoryLimitMb: 256,
        testCases: [
            { input: "4 5\n11110\n11010\n11000\n00000", output: "1" },
            { input: "4 5\n11000\n11000\n00100\n00011", output: "3" },
        ],
        hints: ["DFS/BFS from each unvisited land cell.", "Mark visited cells to avoid recounting."],
    },
    {
        title: "Coin Change",
        difficulty: "medium" as const,
        tags: ["dynamic-programming", "breadth-first-search"],
        description: `You are given an integer array \`coins\` representing coins of different denominations and an integer \`amount\` representing a total amount of money.

Return the fewest number of coins that you need to make up that amount. If that amount of money cannot be made up by any combination of the coins, return \`-1\`.`,
        constraints: "1 ≤ coins.length ≤ 12\n1 ≤ coins[i] ≤ 2³¹ - 1\n0 ≤ amount ≤ 10⁴",
        examples: [
            { input: "coins = [1,5,11], amount = 11", output: "1" },
            { input: "coins = [2], amount = 3", output: "-1" },
            { input: "coins = [1], amount = 0", output: "0" },
        ],
        timeLimitMs: 1500,
        memoryLimitMb: 256,
        testCases: [
            { input: "3\n1 5 11\n11", output: "1" },
            { input: "1\n2\n3", output: "-1" },
            { input: "1\n1\n0", output: "0" },
        ],
        hints: ["Classic unbounded knapsack DP.", "dp[i] = min coins to make amount i."],
    },
    {
        title: "Longest Palindromic Substring",
        difficulty: "medium" as const,
        tags: ["string", "dynamic-programming", "two-pointers"],
        description: `Given a string \`s\`, return the longest palindromic substring in \`s\`.`,
        constraints: "1 ≤ s.length ≤ 1000\ns consists of only digits and English letters",
        examples: [
            { input: `s = "babad"`, output: `"bab"`, explanation: '"aba" is also a valid answer' },
            { input: `s = "cbbd"`, output: `"bb"` },
        ],
        timeLimitMs: 2000,
        memoryLimitMb: 256,
        testCases: [
            { input: "babad", output: "bab" },
            { input: "cbbd", output: "bb" },
            { input: "a", output: "a" },
            { input: "racecar", output: "racecar" },
        ],
        hints: ["Expand around center for each character.", "Handle both odd and even length palindromes."],
    },
    {
        title: "LRU Cache",
        difficulty: "hard" as const,
        tags: ["hash-map", "linked-list", "design"],
        description: `Design a data structure that follows the constraints of a Least Recently Used (LRU) cache.

Implement the \`LRUCache\` class:
- \`LRUCache(int capacity)\` Initialize with positive size \`capacity\`
- \`int get(int key)\` Return the value if it exists, otherwise return \`-1\`
- \`void put(int key, int value)\` Update or insert the value. If it exceeds capacity, evict the LRU key.

Both \`get\` and \`put\` must run in O(1) average time complexity.`,
        constraints: "1 ≤ capacity ≤ 3000\n0 ≤ key ≤ 10⁴\n0 ≤ value ≤ 10⁵\nAt most 2 × 10⁵ calls to get and put",
        examples: [
            {
                input: `LRUCache lRUCache = new LRUCache(2);
lRUCache.put(1, 1);
lRUCache.put(2, 2);
lRUCache.get(1);
lRUCache.put(3, 3);
lRUCache.get(2);`,
                output: "[null,null,null,1,null,-1]",
            },
        ],
        timeLimitMs: 2000,
        memoryLimitMb: 256,
        testCases: [
            { input: "2\nput 1 1\nput 2 2\nget 1\nput 3 3\nget 2\nget 3", output: "1\n-1\n3" },
        ],
        hints: ["Use a doubly linked list + hash map.", "The list tracks access order; the map gives O(1) access."],
    },
];

async function seed() {
    console.log("🌱 Seeding problems...");
    await db.delete(require("./schema").problems);

    for (const p of PROBLEMS) {
        await db.insert(problems).values({
            title: p.title,
            difficulty: p.difficulty,
            tags: p.tags,
            description: p.description,
            constraints: p.constraints,
            examples: p.examples,
            testCases: p.testCases,
            hints: p.hints,
            timeLimitMs: p.timeLimitMs,
            memoryLimitMb: p.memoryLimitMb,
        });
        console.log(`  ✓ ${p.title}`);
    }

    console.log(`\n✅ Seeded ${PROBLEMS.length} problems!`);
    process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
