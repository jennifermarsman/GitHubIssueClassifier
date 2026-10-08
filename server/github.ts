const GITHUB_API = "https://api.github.com";

export interface Repository {
  owner: string;
  name: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  htmlUrl: string;
  currentLabels: string[];
}

interface GitHubIssueResponse {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  pull_request?: unknown;
  labels: Array<string | { name?: string }>;
}

interface GitHubLabelResponse {
  name: string;
}

export function parseRepositoryUrl(value: string): Repository {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid GitHub repository URL.");
  }

  if (url.hostname.toLowerCase() !== "github.com") {
    throw new Error("The repository URL must use github.com.");
  }

  const normalizedPath = url.pathname.replace(/\/+$/, "").replace(/\.git$/, "");
  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.length !== 2) {
    throw new Error("Use a repository URL such as https://github.com/owner/repository.");
  }

  return { owner: segments[0], name: segments[1] };
}

function githubHeaders(token?: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "GitHub-Issue-Classifier",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function githubRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<{ data: T; response: Response }> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      ...githubHeaders(token),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    const message =
      response.status === 404
        ? "Repository not found. If it is private, provide a GitHub token with access."
        : `GitHub API request failed (${response.status}): ${detail || response.statusText}`;
    throw new Error(message);
  }

  const text = await response.text();
  return {
    data: text ? (JSON.parse(text) as T) : (undefined as T),
    response,
  };
}

export async function fetchAllIssues(
  repository: Repository,
  token?: string,
): Promise<GitHubIssue[]> {
  const issues: GitHubIssue[] = [];
  let page = 1;

  while (true) {
    const path =
      `/repos/${repository.owner}/${repository.name}/issues` +
      `?state=all&per_page=100&page=${page}&sort=created&direction=asc`;
    const { data } = await githubRequest<GitHubIssueResponse[]>(path, {}, token);

    for (const issue of data) {
      if (issue.pull_request) continue;
      issues.push({
        number: issue.number,
        title: issue.title,
        body: issue.body ?? "",
        htmlUrl: issue.html_url,
        currentLabels: issue.labels
          .map((label) => (typeof label === "string" ? label : label.name))
          .filter((label): label is string => Boolean(label)),
      });
    }

    if (data.length < 100) break;
    page += 1;
  }

  return issues;
}

async function ensureLabelsExist(
  repository: Repository,
  labels: string[],
  token: string,
): Promise<void> {
  const existing: GitHubLabelResponse[] = [];
  let page = 1;
  while (true) {
    const { data } = await githubRequest<GitHubLabelResponse[]>(
      `/repos/${repository.owner}/${repository.name}/labels?per_page=100&page=${page}`,
      {},
      token,
    );
    existing.push(...data);
    if (data.length < 100) break;
    page += 1;
  }
  const existingNames = new Set(existing.map((label) => label.name.toLowerCase()));

  for (const label of new Set(labels)) {
    if (existingNames.has(label.toLowerCase())) continue;
    await githubRequest(
      `/repos/${repository.owner}/${repository.name}/labels`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: label,
          color: "59636e",
          description: "Created by GitHub Issue Classifier",
        }),
      },
      token,
    );
    existingNames.add(label.toLowerCase());
  }
}

export async function publishIssueLabels(
  repository: Repository,
  assignments: Array<{ issueNumber: number; label: string }>,
  token: string,
): Promise<void> {
  await ensureLabelsExist(
    repository,
    assignments.map((assignment) => assignment.label),
    token,
  );

  for (const assignment of assignments) {
    await githubRequest(
      `/repos/${repository.owner}/${repository.name}/issues/${assignment.issueNumber}/labels`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labels: [assignment.label] }),
      },
      token,
    );
  }
}
