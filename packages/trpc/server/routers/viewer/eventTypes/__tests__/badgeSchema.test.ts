import { describe, expect, it } from "vitest";

import { ZUpdateInputSchema } from "../types";

describe("ZUpdateInputSchema badge", () => {
  it("trims the badge", () => {
    expect(ZUpdateInputSchema.parse({ id: 1, badge: "  Popular " }).badge).toBe("Popular");
  });

  it("converts an empty badge to null so it can be cleared", () => {
    expect(ZUpdateInputSchema.parse({ id: 1, badge: "   " }).badge).toBeNull();
  });

  it("accepts null and leaves an omitted badge untouched", () => {
    expect(ZUpdateInputSchema.parse({ id: 1, badge: null }).badge).toBeNull();
    expect(ZUpdateInputSchema.parse({ id: 1 }).badge).toBeUndefined();
  });

  it("rejects badges longer than 30 characters", () => {
    expect(ZUpdateInputSchema.safeParse({ id: 1, badge: "a".repeat(31) }).success).toBe(false);
  });
});
