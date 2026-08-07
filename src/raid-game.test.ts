import { describe, expect, it } from "vitest";
import { getRaidActionDamage, getRaidResult, isRaidMissionComplete, type RecentRaidActions } from "./raid-game";

describe("couple raid rules", () => {
  it("only attacks damage the boss", () => {
    expect(getRaidActionDamage("straight")).toBe(10);
    expect(getRaidActionDamage("hook")).toBe(14);
    expect(getRaidActionDamage("duck")).toBe(0);
    expect(getRaidActionDamage("block")).toBe(0);
  });

  it("completes the high-low mission with opposite player actions", () => {
    const recent: RecentRaidActions = { host: { duck: 1000 }, guest: { straight: 2600 } };
    expect(isRaidMissionComplete(0, recent, 2700)).toBe(true);
  });

  it("rejects actions outside the combo window", () => {
    const recent: RecentRaidActions = { host: { block: 1000 }, guest: { block: 5000 } };
    expect(isRaidMissionComplete(1, recent, 5000)).toBe(false);
  });

  it("builds a victory result from the remaining time", () => {
    expect(getRaidResult(0, 90)).toEqual({ won: true, title: "討伐成功！", detail: "默契度 82% · 剩餘 90 秒", chemistry: 82 });
  });
});
