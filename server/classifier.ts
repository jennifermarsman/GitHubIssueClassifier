import { choice, TypeSafeClient } from "@typesafe-ai/sdk";
import { getConfig } from "./config.js";
import type { GitHubIssue } from "./github.js";

export interface Classification {
  issueNumber: number;
  title: string;
  htmlUrl: string;
  currentLabels: string[];
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
}

const labelDescriptions: Record<string, string> = {
  bug: "A reproducible defect, error, regression, or unexpected behavior.",
  documentation: "A documentation addition, correction, clarification, or example.",
  enhancement: "A request for a new feature or an improvement to existing behavior.",
  invalid: "An issue that is incorrect, unactionable, duplicate, or lacks a valid problem.",
  question: "A request for help, explanation, guidance, or clarification.",
};

function createClient(): TypeSafeClient {
  const config = getConfig();
  return new TypeSafeClient({
    apiKey: config.TYPESAFE_API_KEY,
    baseURL: config.TYPESAFE_BASE_URL,
    defaultModel: config.TYPESAFE_DEFAULT_MODEL,
    timeout: 180_000,
  });
}

async function classifyIssue(
  client: TypeSafeClient,
  issue: GitHubIssue,
  labels: string[],
): Promise<Classification> {
  const criteria = Object.fromEntries(
    labels.map((label) => [
      label,
      labelDescriptions[label.toLowerCase()] ??
        `The issue is best categorized with the "${label}" label.`,
    ]),
  );
  const response = await client.systemOne({
    state: {
      title: issue.title,
      body: issue.body,
      existingLabels: issue.currentLabels,
    },
    questions: {
      issueLabel: choice(
        "Which single label best classifies this GitHub issue? Base the decision on the title and body.",
        criteria,
      ),
    },
  });
  const answer = response.answers.issueLabel;

  return {
    issueNumber: issue.number,
    title: issue.title,
    htmlUrl: issue.htmlUrl,
    currentLabels: issue.currentLabels,
    label: answer.choice,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
  };
}

export async function classifyIssues(
  issues: GitHubIssue[],
  labels: string[],
): Promise<Classification[]> {
  const client = createClient();
  const results: Classification[] = new Array(issues.length);
  const concurrency = Math.min(5, issues.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < issues.length) {
      const index = nextIndex++;
      results[index] = await classifyIssue(client, issues[index], labels);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}
