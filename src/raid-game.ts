export type RaidAction = "straight" | "hook" | "duck" | "block";
export type RaidActor = "host" | "guest";

export const RAID_SECONDS = 180;
export const RAID_BOSS_MAX_HEALTH = 720;
export const RAID_COMBO_WINDOW_MS = 3000;

export const RAID_MISSIONS = [
  {
    title: "高低夾擊",
    prompt: "3 秒內一人下蹲、一人直拳",
    requirements: ["duck", "straight"] as const,
  },
  {
    title: "心電感應",
    prompt: "3 秒內兩人同時格檔",
    requirements: ["block", "block"] as const,
  },
  {
    title: "旋風雙擊",
    prompt: "3 秒內兩人各出一記勾拳",
    requirements: ["hook", "hook"] as const,
  },
] as const;

export type RecentRaidActions = Record<RaidActor, Partial<Record<RaidAction, number>>>;

export function getRaidActionDamage(action: RaidAction) {
  if (action === "straight") return 10;
  if (action === "hook") return 14;
  return 0;
}

export function isRaidMissionComplete(missionIndex: number, recent: RecentRaidActions, now: number, windowMs = RAID_COMBO_WINDOW_MS) {
  const mission = RAID_MISSIONS[missionIndex % RAID_MISSIONS.length];
  const [first, second] = mission.requirements;
  const hostFirst = recent.host[first];
  const guestSecond = recent.guest[second];
  const hostSecond = recent.host[second];
  const guestFirst = recent.guest[first];
  const pairIsFresh = (a?: number, b?: number) => a !== undefined && b !== undefined && now - a <= windowMs && now - b <= windowMs && Math.abs(a - b) <= windowMs;

  return pairIsFresh(hostFirst, guestSecond) || pairIsFresh(hostSecond, guestFirst);
}

export function getRaidResult(bossHealth: number, seconds: number) {
  if (bossHealth <= 0) {
    const chemistry = Math.min(100, 72 + Math.floor(seconds / 9));
    return { won: true, title: "討伐成功！", detail: `默契度 ${chemistry}% · 剩餘 ${seconds} 秒`, chemistry };
  }
  return { won: false, title: "差一點就成功！", detail: "今天已經比昨天更有默契了", chemistry: 68 };
}
