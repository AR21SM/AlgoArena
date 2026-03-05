// ============================================================
// CodeArena Shared Types
// ============================================================

// ----------- Enums / Unions -----------
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Language = 'cpp' | 'python' | 'java' | 'javascript' | 'typescript';
export type RoomStatus = 'lobby' | 'countdown' | 'in_progress' | 'finished';
export type SubmissionStatus = 'pending' | 'accepted' | 'wrong_answer' | 'time_limit_exceeded' | 'runtime_error' | 'compilation_error';

// ----------- Domain Models -----------
export interface User {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;
  eloRating: number;
  createdAt: string;
}

export interface Problem {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  tags: string[];
  timeLimitMs: number;
  memoryLimitMb: number;
  examples: Example[];
  constraints: string;
  hints?: string[];
}

export interface Example {
  input: string;
  output: string;
  explanation?: string;
}

export interface RoomConfig {
  maxPlayers: number;
  timePerQuestionSec: number;
  difficultyRange: [Difficulty, Difficulty];
  topics: string[];
  totalQuestions: number;
  isPrivate: boolean;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  status: RoomStatus;
  config: RoomConfig;
  currentQuestionIdx: number;
  players: RoomPlayer[];
  createdAt: string;
}

export interface RoomPlayer {
  userId: string;
  username: string;
  avatarUrl?: string;
  eloRating: number;
  score: number;
  rank: number;
  solvedQuestions: number[];
  isReady: boolean;
  isConnected: boolean;
  wrongAttempts: Record<string, number>; // problemId -> count
}

export interface Submission {
  id: string;
  roomId: string;
  userId: string;
  problemId: string;
  language: Language;
  code: string;
  status: SubmissionStatus;
  timeTakenMs?: number;
  scoreAwarded: number;
  wrongAttempts: number;
  submittedAt: string;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  avatarUrl?: string;
  score: number;
  rank: number;
  solvedCount: number;
  lastSolvedAt?: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  avatarUrl?: string;
  message: string;
  timestamp: string;
}

export interface MatchResult {
  roomId: string;
  players: MatchPlayerResult[];
  duration: number;
  endedAt: string;
}

export interface MatchPlayerResult extends LeaderboardEntry {
  eloChange: number;
  perQuestionScores: QuestionScore[];
}

export interface QuestionScore {
  problemId: string;
  score: number;
  timeTakenMs?: number;
  wrongAttempts: number;
  solved: boolean;
}

// ----------- WebSocket Events (Server → Client) -----------
export type ServerToClientEvent =
  | { type: 'ROOM_STATE'; payload: Room }
  | { type: 'PLAYER_JOINED'; payload: RoomPlayer }
  | { type: 'PLAYER_LEFT'; payload: { userId: string } }
  | { type: 'PLAYER_READY_CHANGE'; payload: { userId: string; isReady: boolean } }
  | { type: 'COUNTDOWN_START'; payload: { seconds: number } }
  | { type: 'ROUND_START'; payload: { problem: Problem; roundIdx: number; endsAt: string } }
  | { type: 'LEADERBOARD_UPDATE'; payload: LeaderboardEntry[] }
  | { type: 'PLAYER_SOLVED'; payload: { userId: string; username: string; timeTakenMs: number; score: number } }
  | { type: 'WRONG_SUBMISSION'; payload: { userId: string; lockUntil: string } }
  | { type: 'ROUND_END'; payload: { roundIdx: number; leaderboard: LeaderboardEntry[] } }
  | { type: 'MATCH_END'; payload: MatchResult }
  | { type: 'CHAT_MESSAGE'; payload: ChatMessage }
  | { type: 'TIMER_TICK'; payload: { secondsRemaining: number } }
  | { type: 'ERROR'; payload: { message: string } };

// ----------- WebSocket Events (Client → Server) -----------
export type ClientToServerEvent =
  | { type: 'JOIN_ROOM'; payload: { roomCode: string; userId: string; token: string } }
  | { type: 'PLAYER_READY'; payload: { isReady: boolean } }
  | { type: 'START_GAME' }
  | { type: 'SUBMIT_CODE'; payload: { problemId: string; language: Language; code: string } }
  | { type: 'SEND_CHAT'; payload: { message: string } }
  | { type: 'LEAVE_ROOM' };

// ----------- REST API Types -----------
export interface CreateRoomRequest {
  config: RoomConfig;
}

export interface CreateRoomResponse {
  room: Room;
  code: string;
}

export interface JoinRoomRequest {
  code: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface SubmitCodeRequest {
  problemId: string;
  language: Language;
  code: string;
  roomId: string;
}

// ----------- Scoring -----------
export function calculateScore(params: {
  maxTimeSec: number;
  timeTakenMs: number;
  difficulty: Difficulty;
  wrongAttempts: number;
  isFirstSolve: boolean;
}): number {
  const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
    easy: 1.0,
    medium: 1.5,
    hard: 2.0,
  };
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

// ----------- Judge0 Language IDs -----------
export const LANGUAGE_IDS: Record<Language, number> = {
  cpp: 54,        // C++ (GCC 9.2.0)
  python: 71,     // Python 3.8
  java: 62,       // Java (OpenJDK 13)
  javascript: 63, // Node.js 12
  typescript: 74, // TypeScript 3.7
};

export const LANGUAGE_LABELS: Record<Language, string> = {
  cpp: 'C++ 17',
  python: 'Python 3',
  java: 'Java',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
};
