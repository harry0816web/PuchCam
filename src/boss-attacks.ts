import type { DodgeDirection } from "./game-rules";

export type BossAttackKind = "straight" | "sweep" | "slam";
export type BossAttackPhase = "idle" | "windup" | "attack";

export const BOSS_ATTACKS: Record<BossAttackKind, { title: string; prompt: string; defense: string; image: string }> = {
  straight: {
    title: "雷雲直拳",
    prompt: "拳頭來了！向左或向右閃",
    defense: "左右側閃",
    image: "/assets/boss/cloud-champion-straight.png",
  },
  sweep: {
    title: "旋風橫掃",
    prompt: "風弧掃過！快下蹲",
    defense: "下蹲",
    image: "/assets/boss/cloud-champion-sweep.png",
  },
  slam: {
    title: "雲震重擊",
    prompt: "地面震波！雙手舉高格檔",
    defense: "雙手格檔",
    image: "/assets/boss/cloud-champion-slam.png",
  },
};

export const BOSS_WINDUP_IMAGE = "/assets/boss/cloud-champion-windup.png";
export const BOSS_HIT_IMAGE = "/assets/boss/cloud-champion-hit.png";
export const BOSS_IDLE_IMAGE = "/assets/couple-raid-hero.png";
export const BOSS_ATTACK_TIMING = {
  windup: 0,
  attack: 950,
  resolve: 1450,
  idle: 2100,
  clearResult: 2750,
} as const;

export function getBossAttackTimeline(startsAt: number) {
  return {
    windupAt: startsAt + BOSS_ATTACK_TIMING.windup,
    attackAt: startsAt + BOSS_ATTACK_TIMING.attack,
    resolveAt: startsAt + BOSS_ATTACK_TIMING.resolve,
    idleAt: startsAt + BOSS_ATTACK_TIMING.idle,
    clearResultAt: startsAt + BOSS_ATTACK_TIMING.clearResult,
  };
}

export function getBossSceneImage(phase: BossAttackPhase, kind: BossAttackKind | null, hit: boolean) {
  if (phase === "windup") return BOSS_WINDUP_IMAGE;
  if (phase === "attack" && kind) return BOSS_ATTACKS[kind].image;
  if (hit) return BOSS_HIT_IMAGE;
  return BOSS_IDLE_IMAGE;
}

export function isBossAttackAvoided(kind: BossAttackKind, dodge: DodgeDirection | null, blocking: boolean) {
  if (kind === "straight") return dodge === "向左" || dodge === "向右";
  if (kind === "sweep") return dodge === "下蹲";
  return blocking;
}
