import { describe, expect, it } from "vitest";
import { MAX_EVENT_TYPE_BADGE_LABEL_LENGTH } from "../constants";
import { eventTypeBadgeLabel } from "./eventTypeBadgeLabel";

describe("eventTypeBadgeLabel", () => {
  it("trims surrounding whitespace", () => {
    expect(eventTypeBadgeLabel.parse("  Popular  ")).toBe("Popular");
  });

  it("converts an empty string to null so the badge is cleared", () => {
    expect(eventTypeBadgeLabel.parse("")).toBeNull();
  });

  it("converts a whitespace-only string to null", () => {
    expect(eventTypeBadgeLabel.parse("    ")).toBeNull();
  });

  it("accepts a label of exactly the maximum length", () => {
    const label = "a".repeat(MAX_EVENT_TYPE_BADGE_LABEL_LENGTH);
    expect(eventTypeBadgeLabel.parse(label)).toBe(label);
  });

  it("rejects a label longer than the maximum length", () => {
    const result = eventTypeBadgeLabel.safeParse("a".repeat(MAX_EVENT_TYPE_BADGE_LABEL_LENGTH + 1));
    expect(result.success).toBe(false);
  });

  it("measures the length after trimming", () => {
    const label = ` ${"a".repeat(MAX_EVENT_TYPE_BADGE_LABEL_LENGTH)} `;
    expect(eventTypeBadgeLabel.parse(label)).toBe("a".repeat(MAX_EVENT_TYPE_BADGE_LABEL_LENGTH));
  });
});
