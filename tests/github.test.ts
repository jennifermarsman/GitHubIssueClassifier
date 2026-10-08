import { describe, expect, it } from "vitest";
import { parseRepositoryUrl } from "../server/github.js";

describe("parseRepositoryUrl", () => {
  it("parses a standard repository URL", () => {
    expect(parseRepositoryUrl("https://github.com/microsoft/typescript")).toEqual({
      owner: "microsoft",
      name: "typescript",
    });
  });

  it("accepts a trailing slash and git suffix", () => {
    expect(parseRepositoryUrl("https://github.com/owner/repository.git/")).toEqual({
      owner: "owner",
      name: "repository",
    });
  });

  it("rejects non-GitHub and non-repository URLs", () => {
    expect(() => parseRepositoryUrl("https://example.com/owner/repository")).toThrow(
      "must use github.com",
    );
    expect(() => parseRepositoryUrl("https://github.com/owner")).toThrow(
      "Use a repository URL",
    );
  });
});
