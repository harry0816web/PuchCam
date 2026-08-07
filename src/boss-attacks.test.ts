import { describe, expect, it } from "vitest";
import { BOSS_ATTACKS, BOSS_HIT_IMAGE, BOSS_IDLE_IMAGE, BOSS_WINDUP_IMAGE, getBossAttackTimeline, getBossSceneImage, isBossAttackAvoided } from "./boss-attacks";

describe("boss attack defenses", () => {
  it("requires a side dodge for a straight attack", () => {
    expect(isBossAttackAvoided("straight", "向左", false)).toBe(true);
    expect(isBossAttackAvoided("straight", "下蹲", false)).toBe(false);
  });

  it("requires a duck for the sweep attack", () => {
    expect(isBossAttackAvoided("sweep", "下蹲", false)).toBe(true);
    expect(isBossAttackAvoided("sweep", "向右", false)).toBe(false);
  });

  it("requires a guard for the ground slam", () => {
    expect(isBossAttackAvoided("slam", null, true)).toBe(true);
    expect(isBossAttackAvoided("slam", "下蹲", false)).toBe(false);
  });

  it("provides a visual and defense prompt for every attack", () => {
    for (const attack of Object.values(BOSS_ATTACKS)) {
      expect(attack.image).toMatch(/\.png$/);
      expect(attack.prompt.length).toBeGreaterThan(4);
      expect(attack.defense.length).toBeGreaterThan(1);
    }
  });

  it("builds the complete telegraph, attack, resolve, and recovery timeline", () => {
    expect(getBossAttackTimeline(1000)).toEqual({
      windupAt: 1000,
      attackAt: 1950,
      resolveAt: 2450,
      idleAt: 3100,
      clearResultAt: 3750,
    });
  });

  it("selects the correct scene image for every boss state", () => {
    expect(getBossSceneImage("idle", null, false)).toBe(BOSS_IDLE_IMAGE);
    expect(getBossSceneImage("idle", null, true)).toBe(BOSS_HIT_IMAGE);
    expect(getBossSceneImage("windup", "straight", false)).toBe(BOSS_WINDUP_IMAGE);
    for (const kind of ["straight", "sweep", "slam"] as const) {
      expect(getBossSceneImage("attack", kind, false)).toBe(BOSS_ATTACKS[kind].image);
    }
  });
});
