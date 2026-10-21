import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllIssues, parseRepositoryUrl, publishIssueLabels } from "../server/github.js";

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

describe("fetchAllIssues", () => {
  const repository = { owner: "owner", name: "repository" };
  const initialUrl =
    "https://api.github.com/repos/owner/repository/issues" +
    "?state=all&per_page=100&sort=created&direction=asc";
  const issue = {
    number: 1,
    title: "An issue",
    body: null,
    html_url: "https://github.com/owner/repository/issues/1",
    labels: ["bug", { name: "question" }, {}],
  };

  it("follows cursor links through short, pull-request-only pages", async () => {
    const nextUrl =
      "https://api.github.com/repositories/123/issues" +
      "?state=all&per_page=100&sort=created&direction=asc&after=Y3Vyc29y%3D";
    const lastUrl = nextUrl.replace("Y3Vyc29y%3D", "bmV4dA%3D%3D");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([issue]), {
        headers: { Link: `<${nextUrl}>; rel="next", <${lastUrl}>; rel="last"` },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ ...issue, pull_request: {} }]), {
        headers: { Link: `<${initialUrl}>; rel="prev", <${lastUrl}>; rel="next"` },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ ...issue, number: 3, body: "Details" }]), {
        headers: { Link: `<${nextUrl}>; rel="prev"` },
      }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchAllIssues(repository, "test-token")).toEqual([
      {
        number: 1,
        title: "An issue",
        body: "",
        htmlUrl: issue.html_url,
        currentLabels: ["bug", "question"],
      },
      {
        number: 3,
        title: "An issue",
        body: "Details",
        htmlUrl: issue.html_url,
        currentLabels: ["bug", "question"],
      },
    ]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([initialUrl, nextUrl, lastUrl]);
    const authorization = fetchMock.mock.calls[0][1].headers.Authorization;
    expect(authorization).toBeTruthy();
    for (const [, options] of fetchMock.mock.calls) {
      expect(options.headers.Authorization).toBe(authorization);
    }
  });

  it("also follows page-number links returned by GitHub", async () => {
    const nextUrl = `${initialUrl}&page=2`;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([issue]), {
        headers: { Link: `<${nextUrl}>; rel="next"` },
      }))
      .mockResolvedValueOnce(new Response("[]"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchAllIssues(repository)).toHaveLength(1);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([initialUrl, nextUrl]);
  });

  it.each([0, 100])("stops without a next link even with %i results", async (count) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(Array.from({ length: count }, () => issue))),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchAllIssues(repository)).toHaveLength(count);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(initialUrl);
  });

  it("propagates API errors on subsequent pages", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("[]", {
        headers: { Link: `<${initialUrl}&after=cursor>; rel="next"` },
      }))
      .mockResolvedValueOnce(new Response("Rate limit exceeded", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAllIssues(repository)).rejects.toThrow(
      "GitHub API request failed (403): Rate limit exceeded",
    );
  });

  it("rejects pagination links outside the GitHub API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", {
      headers: { Link: '<https://example.com/issues?after=cursor>; rel="next"' },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAllIssues(repository, "test-token")).rejects.toThrow(
      "GitHub pagination link must use api.github.com.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
