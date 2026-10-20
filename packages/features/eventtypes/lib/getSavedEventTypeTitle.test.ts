import { describe, expect, it } from "vitest";
import { getSavedEventTypeTitle } from "./getSavedEventTypeTitle";

describe("getSavedEventTypeTitle", () => {
  it("returns the submitted title when the save changed it", () => {
    expect(getSavedEventTypeTitle({ submittedTitle: "Athletic Practice", formTitle: "30min" })).toBe(
      "Athletic Practice"
    );
  });

  it("returns the form title when the save did not include a title", () => {
    expect(getSavedEventTypeTitle({ submittedTitle: undefined, formTitle: "Athletic Practice" })).toBe(
      "Athletic Practice"
    );
  });
});
