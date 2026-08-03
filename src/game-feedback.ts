import type { PunchHand, PunchKind } from "./game-rules";

export type FighterStats = { hits: number; damage: number };
export type RoundStats = { you: FighterStats; friend: FighterStats };
export type CombatOutcome = "hit" | "blocked" | "evaded";
export type FeedbackAction = PunchKind | "dodge" | "block" | "hit" | "blocked";

export const EMPTY_ROUND_STATS: RoundStats = { you: { hits: 0, damage: 0 }, friend: { hits: 0, damage: 0 } };

export function recordRoundHit(stats: RoundStats, attacker: "you" | "friend", damage: number): RoundStats {
  if (damage <= 0) return stats;
  const fighter = stats[attacker];
  return { ...stats, [attacker]: { hits: fighter.hits + 1, damage: fighter.damage + damage } };
}

export function getRoundEndNotice({ round, rounds, myHealth, opponentHealth, stats, totalMyHits, totalOpponentHits }: { round: number; rounds: number; myHealth: number; opponentHealth: number; stats: RoundStats; totalMyHits: number; totalOpponentHits: number }) {
  const ko = myHealth === 0 || opponentHealth === 0;
  if (round < rounds) {
    return { title: ko ? "KO!" : `ROUND ${round} 結束`, detail: `你 ${stats.you.hits} 擊／${stats.you.damage} 傷害 · 對手 ${stats.friend.hits} 擊／${stats.friend.damage} 傷害`, isMatchOver: false };
  }
  const title = totalMyHits === totalOpponentHits ? "DRAW" : totalMyHits > totalOpponentHits ? "YOU WIN!" : "FRIEND WINS";
  return { title, detail: `最終命中：你 ${totalMyHits} · 對手 ${totalOpponentHits}`, isMatchOver: true };
}

export function getActionFeedback(action: FeedbackAction) {
  return {
    straight: { oscillator: "sawtooth" as OscillatorType, start: 260, end: 110, duration: 0.09, gain: 0.05, vibration: 10 },
    hook: { oscillator: "square" as OscillatorType, start: 180, end: 65, duration: 0.13, gain: 0.065, vibration: 16 },
    dodge: { oscillator: "sine" as OscillatorType, start: 420, end: 720, duration: 0.1, gain: 0.035, vibration: 7 },
    block: { oscillator: "triangle" as OscillatorType, start: 520, end: 280, duration: 0.12, gain: 0.06, vibration: 14 },
    hit: { oscillator: "square" as OscillatorType, start: 170, end: 58, duration: 0.16, gain: 0.12, vibration: 35 },
    blocked: { oscillator: "triangle" as OscillatorType, start: 260, end: 120, duration: 0.16, gain: 0.07, vibration: 18 },
  }[action];
}

export function getAttackTrajectory(kind: PunchKind, hand: PunchHand) {
  return kind === "straight" ? `${hand}-straight` : `${hand}-hook`;
}
