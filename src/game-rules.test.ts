import { describe, expect, it } from "vitest";
import { damageForPunch, getDodgeDirection, getPunchKind, isBlocking, isWristTracked } from "./game-rules";

describe("game movement rules", () => {
  it("only considers confidently visible wrists as tracked", () => {
    expect(isWristTracked(0.56)).toBe(true);
    expect(isWristTracked(0.55)).toBe(false);
  });

  it("classifies straight punches, hooks, and motion below the threshold", () => {
    expect(getPunchKind({ speed: 0.003, shoulder: { x: 0.5, y: 0.5 }, elbow: { x: 0.6, y: 0.5 }, wrist: { x: 0.75, y: 0.5 } })).toBe("straight");
    expect(getPunchKind({ speed: 0.003, shoulder: { x: 0.5, y: 0.5 }, elbow: { x: 0.7, y: 0.5 }, wrist: { x: 0.62, y: 0.65 } })).toBe("hook");
    expect(getPunchKind({ speed: 0.0022, shoulder: { x: 0.5, y: 0.5 }, elbow: { x: 0.6, y: 0.5 }, wrist: { x: 0.75, y: 0.5 } })).toBeNull();
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
});
