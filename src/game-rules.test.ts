import { describe, expect, it } from "vitest";
import { createMotionThresholds, damageForPunch, getDodgeDirection, getPunchKind, isBlocking, isDodgeEffective, isWristTracked, resolvePunch } from "./game-rules";

describe("game movement rules", () => {
  it("only considers confidently visible wrists as tracked", () => {
    expect(isWristTracked(0.56)).toBe(true);
    expect(isWristTracked(0.55)).toBe(false);
  });

  it("classifies straight punches, hooks, and motion below the threshold", () => {
    expect(getPunchKind({ speed: 0.003, shoulder: { x: 0.5, y: 0.5 }, elbow: { x: 0.6, y: 0.5 }, wrist: { x: 0.75, y: 0.5 } })).toBe("straight");
    expect(getPunchKind({ speed: 0.003, shoulder: { x: 0.5, y: 0.5 }, elbow: { x: 0.7, y: 0.5 }, wrist: { x: 0.62, y: 0.65 } })).toBe("hook");
    expect(getPunchKind({ speed: 0.0018, shoulder: { x: 0.5, y: 0.5 }, elbow: { x: 0.6, y: 0.5 }, wrist: { x: 0.75, y: 0.5 } })).toBeNull();
  });

  it("recognizes the recorded right-hand straight-punch shape", () => {
    // Real sample from the calibration tool: t=2089 ms in the supplied
    // right-hand straight-punch recording.
    expect(getPunchKind({ speed: 0.0085, shoulder: { x: 0.4133, y: 0.7212 }, elbow: { x: 0.3013, y: 0.7388 }, wrist: { x: 0.3979, y: 0.348 } })).toBe("straight");
  });

  it("detects side steps and ducks", () => {
    expect(getDodgeDirection({ shoulderCenter: 0.6, neutralShoulderCenter: 0.5, noseX: 0.6, noseY: 0.25, shoulderHeight: 0.5 })).toBe("向左");
    expect(getDodgeDirection({ shoulderCenter: 0.5, neutralShoulderCenter: 0.5, noseX: 0.4, noseY: 0.25, shoulderHeight: 0.5 })).toBe("向右");
    expect(getDodgeDirection({ shoulderCenter: 0.5, neutralShoulderCenter: 0.5, noseX: 0.5, noseY: 0.43, shoulderHeight: 0.5 })).toBe("下蹲");
  });

  it("requires two high wrists to block and reduces damage", () => {
    expect(isBlocking({ leftWrist: { x: 0.42, y: 0.2 }, rightWrist: { x: 0.58, y: 0.2 }, wristsTracked: true })).toBe(true);
    expect(isBlocking({ leftWrist: { x: 0.42, y: 0.4 }, rightWrist: { x: 0.58, y: 0.2 }, wristsTracked: true })).toBe(false);
    expect(damageForPunch("hook", true)).toBe(3);
    expect(damageForPunch("straight", false)).toBe(10);
  });

  it("uses the intended attack-and-defence matchups", () => {
    expect(isDodgeEffective("straight", "向左")).toBe(true);
    expect(isDodgeEffective("straight", "下蹲")).toBe(false);
    expect(isDodgeEffective("hook", "下蹲")).toBe(true);
    expect(isDodgeEffective("hook", "向右")).toBe(false);
    expect(resolvePunch("straight", "向右", false)).toEqual({ damage: 0, outcome: "evaded" });
    expect(resolvePunch("hook", null, true)).toEqual({ damage: 3, outcome: "blocked" });
  });

  it("scales motion thresholds to the calibrated shoulder width", () => {
    const closeToCamera = createMotionThresholds(0.34);
    const farFromCamera = createMotionThresholds(0.16);
    expect(closeToCamera.punchSpeed).toBeGreaterThan(farFromCamera.punchSpeed);
    expect(closeToCamera.sideDodge).toBeGreaterThan(farFromCamera.sideDodge);
    expect(getDodgeDirection({ shoulderCenter: 0.59, neutralShoulderCenter: 0.5, noseX: 0.59, noseY: 0.25, shoulderHeight: 0.5, thresholds: farFromCamera })).toBe("向左");
  });
});
