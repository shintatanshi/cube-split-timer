import { afterEach, describe, expect, it } from "vitest";
import {
  getPreparedScrambleCount,
  prefetchScrambles,
  setRandomStateGeneratorForTests,
  takeScramble,
} from "../src/lib/wcaScramble";

afterEach(() => setRandomStateGeneratorForTests(null));

describe("wcaScramble", () => {
  it("falls back to a random-move scramble until a random-state one is ready", () => {
    setRandomStateGeneratorForTests(() => new Promise(() => {}));
    const taken = takeScramble();
    expect(taken.isRandomState).toBe(false);
    expect(taken.scramble.split(" ").length).toBeGreaterThan(10);
  });

  it("keeps two random-state scrambles ready and serves them in order", async () => {
    let n = 0;
    setRandomStateGeneratorForTests(async () => `R U F${++n}`.replace(/F\d+/, `F${n % 2 === 0 ? "2" : "'"}`));
    await prefetchScrambles();
    expect(getPreparedScrambleCount()).toBe(2);
    const first = takeScramble();
    expect(first).toEqual({ scramble: "R U F'", isRandomState: true });
    await prefetchScrambles();
    expect(getPreparedScrambleCount()).toBe(2);
  });

  it("stops trying and keeps working when the generator cannot load", async () => {
    setRandomStateGeneratorForTests(async () => {
      throw new Error("offline");
    });
    await prefetchScrambles();
    const taken = takeScramble();
    expect(taken.isRandomState).toBe(false);
    expect(getPreparedScrambleCount()).toBe(0);
  });
});
