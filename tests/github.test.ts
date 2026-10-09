import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRepositoryUrl, publishIssueLabels } from "../server/github.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("publishIssueLabels", () => {
  const repository = { owner: "owner", name: "repository" };

  it("publishes only assignments at or above the threshold", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response("[]", { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const published = await publishIssueLabels(
      repository,
      [
        { issueNumber: 1, label: "question", confidence: 0.7499 },
        { issueNumber: 2, label: "bug", confidence: 0.75 },
        { issueNumber: 3, label: "enhancement", confidence: 0.9 },
      ],
      "test-token",
      75,
    );

    expect(published).toBe(2);
    const writes = fetchMock.mock.calls.filter(([, options]) => options.method === "POST");
    expect(writes.map(([url, options]) => [url, JSON.parse(options.body)])).toEqual([
      [
        "https://api.github.com/repos/owner/repository/labels",
        { name: "bug", color: "59636e", description: "Created by GitHub Issue Classifier" },
      ],
      [
        "https://api.github.com/repos/owner/repository/labels",
        { name: "enhancement", color: "59636e", description: "Created by GitHub Issue Classifier" },
      ],
      ["https://api.github.com/repos/owner/repository/issues/2/labels", { labels: ["bug"] }],
      ["https://api.github.com/repos/owner/repository/issues/3/labels", { labels: ["enhancement"] }],
    ]);
  });

  it("does not contact GitHub when all assignments are below the threshold", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(
      await publishIssueLabels(
        repository,
        [{ issueNumber: 1, label: "bug", confidence: 0.8 }],
        "test-token",
        90,
      ),
    ).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { threshold: 0, confidence: 0 },
    { threshold: 100, confidence: 1 },
  ])("supports a threshold of $threshold percent", async ({ threshold, confidence }) => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('[{"name":"bug"}]', { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(
      await publishIssueLabels(
        repository,
        [{ issueNumber: 1, label: "bug", confidence }],
        "test-token",
        threshold,
      ),
    ).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
