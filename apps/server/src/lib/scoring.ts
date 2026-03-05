/**
 * @file scoring.ts
 * @description Server-authoritative scoring functions.
 * Mirrors the shared package for backend use without workspace import issues.
 */
type Difficulty = "easy" | "medium" | "hard";

const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
    easy: 1.0,
    medium: 1.5,
    hard: 2.0,
};

export function calculateScore(params: {
    maxTimeSec: number;
    timeTakenMs: number;
    difficulty: Difficulty;
    wrongAttempts: number;
    isFirstSolve: boolean;
}): number {
    const BASE_SCORE = 100;
    const PENALTY_PER_WRONG = 20;
    const FIRST_SOLVE_BONUS = 50;

    const maxTimeMs = params.maxTimeSec * 1000;
    const timeRatio = 1 - (params.timeTakenMs / maxTimeMs) * 0.6;

    let score = BASE_SCORE * timeRatio * DIFFICULTY_MULTIPLIER[params.difficulty];
    score -= params.wrongAttempts * PENALTY_PER_WRONG;
    if (params.isFirstSolve) score += FIRST_SOLVE_BONUS;

    return Math.max(0, Math.round(score));
}

export function calculateElo(
    playerElo: number,
    opponentElo: number,
    result: 0 | 0.5 | 1,
    k = 32
): number {
    const expected = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
    return Math.round(playerElo + k * (result - expected));
}
