import { describe, expect, it } from "vitest";
import { EMPTY_ROUND_STATS, getActionFeedback, getAttackTrajectory, getRoundEndNotice, recordRoundHit } from "./game-feedback";

describe("P1 game feedback", () => {
  it("records only damaging hits in the appropriate round stat", () => {
    const afterYouHit = recordRoundHit(EMPTY_ROUND_STATS, "you", 10);
    expect(afterYouHit).toEqual({ you: { hits: 1, damage: 10 }, friend: { hits: 0, damage: 0 } });
    expect(recordRoundHit(afterYouHit, "friend", 0)).toBe(afterYouHit);
    expect(recordRoundHit(afterYouHit, "friend", 3)).toEqual({ you: { hits: 1, damage: 10 }, friend: { hits: 1, damage: 3 } });
  });

  it("creates a KO round summary and a final win summary", () => {
    const stats = { you: { hits: 2, damage: 24 }, friend: { hits: 1, damage: 10 } };
    expect(getRoundEndNotice({ round: 1, rounds: 3, myHealth: 0, opponentHealth: 50, stats, totalMyHits: 2, totalOpponentHits: 1 })).toMatchObject({ title: "KO!", isMatchOver: false });
    expect(getRoundEndNotice({ round: 3, rounds: 3, myHealth: 20, opponentHealth: 0, stats, totalMyHits: 4, totalOpponentHits: 2 })).toMatchObject({ title: "YOU WIN!", isMatchOver: true });
  });

  it("keeps distinct feedback profiles and trajectories per action", () => {
    expect(getActionFeedback("hook").vibration).toBeGreaterThan(getActionFeedback("straight").vibration);
    expect(getActionFeedback("hit").duration).toBeGreaterThan(getActionFeedback("dodge").duration);
    expect(getAttackTrajectory("straight", "left")).toBe("left-straight");
    expect(getAttackTrajectory("hook", "right")).toBe("right-hook");
  });
});
