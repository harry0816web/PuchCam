export type PunchKind = "straight" | "hook";
export type PunchHand = "left" | "right";
export type DodgeDirection = "向左" | "向右" | "下蹲";

type Point = { x: number; y: number };

export const GUARD_HEIGHT_RATIO = 0.32;
export const PUNCH_SPEED_THRESHOLD = 0.0022;
export const SIDE_DODGE_THRESHOLD = 0.075;
export const DUCK_DODGE_THRESHOLD = 0.105;

export function isWristTracked(visibility?: number) {
  return (visibility ?? 1) > 0.55;
}

export function getDodgeDirection({ shoulderCenter, neutralShoulderCenter, noseX, noseY, shoulderHeight }: { shoulderCenter: number; neutralShoulderCenter: number; noseX: number; noseY: number; shoulderHeight: number }): DodgeDirection | null {
  if (shoulderHeight - noseY < DUCK_DODGE_THRESHOLD) return "下蹲";
  const bodyOffset = shoulderCenter - neutralShoulderCenter;
  const headOffset = noseX - shoulderCenter;
  if (Math.abs(bodyOffset) <= SIDE_DODGE_THRESHOLD && Math.abs(headOffset) <= SIDE_DODGE_THRESHOLD) return null;
  // The local camera preview is mirrored, so invert raw camera X for its label.
  return (Math.abs(bodyOffset) > SIDE_DODGE_THRESHOLD ? bodyOffset : headOffset) > 0 ? "向左" : "向右";
}

export function isBlocking({ leftWrist, rightWrist, wristsTracked }: { leftWrist: Point; rightWrist: Point; wristsTracked: boolean }) {
  return wristsTracked && leftWrist.y < GUARD_HEIGHT_RATIO && rightWrist.y < GUARD_HEIGHT_RATIO && Math.abs(leftWrist.x - rightWrist.x) < 0.42;
}

export function getPunchKind({ speed, wrist, elbow, shoulder }: { speed: number; wrist: Point; elbow: Point; shoulder: Point }): PunchKind | null {
  if (speed <= PUNCH_SPEED_THRESHOLD) return null;
  const wristDistance = Math.hypot(wrist.x - shoulder.x, wrist.y - shoulder.y);
  const elbowDistance = Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y);
  return wristDistance > elbowDistance * 1.35 ? "straight" : "hook";
}

export function damageForPunch(kind: PunchKind, isBlocking: boolean) {
  const baseDamage = kind === "hook" ? 14 : 10;
  return isBlocking ? Math.ceil(baseDamage * 0.2) : baseDamage;
}

export function isDodgeEffective(kind: PunchKind, dodge: DodgeDirection | null) {
  return (kind === "straight" && (dodge === "向左" || dodge === "向右")) || (kind === "hook" && dodge === "下蹲");
}

export function resolvePunch(kind: PunchKind, dodge: DodgeDirection | null, isBlocking: boolean) {
  if (isDodgeEffective(kind, dodge)) return { damage: 0, outcome: "evaded" as const };
  if (isBlocking) return { damage: damageForPunch(kind, true), outcome: "blocked" as const };
  return { damage: damageForPunch(kind, false), outcome: "hit" as const };
}
