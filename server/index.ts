import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { classifyIssues } from "./classifier.js";
import { getConfig } from "./config.js";
import {
  fetchAllIssues,
  parseRepositoryUrl,
  publishIssueLabels,
} from "./github.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const labelSchema = z.string().trim().min(1).max(50);
const classifySchema = z.object({
  repositoryUrl: z.url(),
  labels: z.array(labelSchema).min(2).max(255),
  githubToken: z.string().trim().optional(),
});
const publishSchema = z.object({
  repositoryUrl: z.url(),
  githubToken: z.string().trim().min(1),
  assignments: z
    .array(
      z.object({
        issueNumber: z.number().int().positive(),
        label: labelSchema,
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(1),
});

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.post("/api/classify", async (request, response) => {
  try {
    const input = classifySchema.parse(request.body);
    const labels = [...new Set(input.labels.map((label) => label.trim()))];
    if (labels.length < 2) {
      response.status(400).json({ error: "Provide at least two unique labels." });
      return;
    }

    const repository = parseRepositoryUrl(input.repositoryUrl);
    const issues = await fetchAllIssues(repository, input.githubToken || undefined);
    const classifications = await classifyIssues(issues, labels);
    response.json({
      repository: `${repository.owner}/${repository.name}`,
      issueCount: issues.length,
      classifications,
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? "Invalid request."
        : error instanceof Error
          ? error.message
          : "Classification failed.";
    response.status(400).json({ error: message });
  }
});

app.post("/api/publish", async (request, response) => {
  try {
    const input = publishSchema.parse(request.body);
    const repository = parseRepositoryUrl(input.repositoryUrl);
    const published = await publishIssueLabels(
      repository,
      input.assignments,
      input.githubToken,
      getConfig().MIN_LABEL_CONFIDENCE,
    );
    response.json({ published, skipped: input.assignments.length - published });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.issues[0]?.message ?? "Invalid request."
        : error instanceof Error
          ? error.message
          : "Publishing labels failed.";
    response.status(400).json({ error: message });
  }
});

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientDirectory = path.resolve(currentDirectory, "../client");
app.use(express.static(clientDirectory));
app.get("/{*path}", (_request, response) => {
  response.sendFile(path.join(clientDirectory, "index.html"));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`GitHub Issue Classifier listening on port ${port}`);
});
