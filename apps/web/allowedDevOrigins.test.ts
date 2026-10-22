import { describe, expect, it } from "vitest";
import { getAllowedDevOrigins } from "./allowedDevOrigins";

describe("getAllowedDevOrigins", () => {
  it("allows the hostname of the public web app URL", () => {
    expect(getAllowedDevOrigins("https://abc--web.previews.example.com/")).toEqual([
      "abc--web.previews.example.com",
    ]);
  });

  it("drops the port and the path", () => {
    expect(getAllowedDevOrigins("http://cal.example.com:3000/app")).toEqual(["cal.example.com"]);
  });

  it("allows nothing when the URL is not set", () => {
    expect(getAllowedDevOrigins(undefined)).toEqual([]);
    expect(getAllowedDevOrigins("")).toEqual([]);
  });

  it("allows nothing when the URL is not valid", () => {
    expect(getAllowedDevOrigins("not a url")).toEqual([]);
  });
});
