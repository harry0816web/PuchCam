export type PunchKind = "straight" | "hook";
export type PunchHand = "left" | "right";
export type DodgeDirection = "向左" | "向右" | "下蹲";

type Point = { x: number; y: number };
export type MotionThresholds = { punchSpeed: number; sideDodge: number; duckDodge: number };

export const GUARD_HEIGHT_RATIO = 0.32;
// Use two-dimensional wrist movement (X + Y), not only horizontal movement.
// Recorded straight punches have a quiet-motion band below roughly 0.0018,
// while real strikes peak well above it.
export const PUNCH_SPEED_THRESHOLD = 0.0018;
export const STRAIGHT_EXTENSION_RATIO = 1.65;
// Players rarely punch perfectly vertical in camera coordinates. Allow a
// diagonal straight; only strongly sideward extension is considered a hook.
export const STRAIGHT_LATERAL_RATIO = 0.95;
export const SIDE_DODGE_THRESHOLD = 0.075;
export const DUCK_DODGE_THRESHOLD = 0.105;

export function createMotionThresholds(shoulderWidth?: number): MotionThresholds {
  if (!shoulderWidth) return { punchSpeed: PUNCH_SPEED_THRESHOLD, sideDodge: SIDE_DODGE_THRESHOLD, duckDodge: DUCK_DODGE_THRESHOLD };
  const bodyScale = Math.max(0.72, Math.min(1.4, shoulderWidth / 0.22));
  return {
    punchSpeed: PUNCH_SPEED_THRESHOLD * bodyScale,
    sideDodge: Math.max(0.055, Math.min(0.115, shoulderWidth * 0.37)),
    duckDodge: Math.max(0.085, Math.min(0.16, shoulderWidth * 0.52)),
  };
}

export function isWristTracked(visibility?: number) {
  return (visibility ?? 1) > 0.55;
}

export function getDodgeDirection({ shoulderCenter, neutralShoulderCenter, noseX, noseY, shoulderHeight, thresholds }: { shoulderCenter: number; neutralShoulderCenter: number; noseX: number; noseY: number; shoulderHeight: number; thresholds?: MotionThresholds }): DodgeDirection | null {
  const { sideDodge, duckDodge } = thresholds ?? createMotionThresholds();
  if (shoulderHeight - noseY < duckDodge) return "下蹲";
  const bodyOffset = shoulderCenter - neutralShoulderCenter;
  const headOffset = noseX - shoulderCenter;
  if (Math.abs(bodyOffset) <= sideDodge && Math.abs(headOffset) <= sideDodge) return null;
  // The local camera preview is mirrored, so invert raw camera X for its label.
  return (Math.abs(bodyOffset) > SIDE_DODGE_THRESHOLD ? bodyOffset : headOffset) > 0 ? "向左" : "向右";
}

export function isBlocking({ leftWrist, rightWrist, wristsTracked }: { leftWrist: Point; rightWrist: Point; wristsTracked: boolean }) {
  return wristsTracked && leftWrist.y < GUARD_HEIGHT_RATIO && rightWrist.y < GUARD_HEIGHT_RATIO && Math.abs(leftWrist.x - rightWrist.x) < 0.42;
}

export function getPunchKind({ speed, wrist, elbow, shoulder, hand, bodyCenterX, thresholds }: { speed: number; wrist: Point; elbow: Point; shoulder: Point; hand?: PunchHand; bodyCenterX?: number; thresholds?: MotionThresholds }): PunchKind | null {
  if (speed <= (thresholds?.punchSpeed ?? PUNCH_SPEED_THRESHOLD)) return null;
  const crossedBodyMidline = hand !== undefined && bodyCenterX !== undefined && (hand === "left" ? wrist.x < bodyCenterX : wrist.x > bodyCenterX);
  if (crossedBodyMidline) return "hook";
  const wristDistance = Math.hypot(wrist.x - shoulder.x, wrist.y - shoulder.y);
  const elbowDistance = Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y);
  const lateralRatio = Math.abs(wrist.x - shoulder.x) / (Math.abs(wrist.y - shoulder.y) + 0.01);
  return wristDistance > elbowDistance * STRAIGHT_EXTENSION_RATIO && lateralRatio <= STRAIGHT_LATERAL_RATIO ? "straight" : null;
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
