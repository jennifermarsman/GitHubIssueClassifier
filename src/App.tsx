import { FormEvent, KeyboardEvent, useMemo, useState } from "react";

const defaultLabels = ["bug", "documentation", "enhancement", "invalid", "question"];

interface Classification {
  issueNumber: number;
  title: string;
  htmlUrl: string;
  currentLabels: string[];
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
}

interface ClassificationResponse {
  repository: string;
  issueCount: number;
  classifications: Classification[];
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "The request failed.");
  }
  return payload;
}

function App() {
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [labels, setLabels] = useState(defaultLabels);
  const [newLabel, setNewLabel] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [result, setResult] = useState<ClassificationResponse | null>(null);
  const [selectedIssues, setSelectedIssues] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const averageConfidence = useMemo(() => {
    if (!result?.classifications.length) return 0;
    return (
      result.classifications.reduce((sum, item) => sum + item.confidence, 0) /
      result.classifications.length
    );
  }, [result]);

  function addLabel() {
    const label = newLabel.trim();
    if (!label || labels.some((item) => item.toLowerCase() === label.toLowerCase())) {
      setNewLabel("");
      return;
    }
    setLabels([...labels, label]);
    setNewLabel("");
  }

  function handleLabelKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addLabel();
    }
  }

  async function classify(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryUrl,
          labels,
          githubToken: githubToken || undefined,
        }),
      });
      const data = await readApiResponse<ClassificationResponse>(response);
      setResult(data);
      setSelectedIssues(new Set(data.classifications.map((item) => item.issueNumber)));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Classification failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleIssue(issueNumber: number) {
    setSelectedIssues((current) => {
      const next = new Set(current);
      if (next.has(issueNumber)) next.delete(issueNumber);
      else next.add(issueNumber);
      return next;
    });
  }

  function updateClassification(issueNumber: number, label: string) {
    setResult((current) =>
      current
        ? {
            ...current,
            classifications: current.classifications.map((item) =>
              item.issueNumber === issueNumber ? { ...item, label } : item,
            ),
          }
        : current,
    );
  }

  async function publish() {
    if (!result || !githubToken) {
      setShowToken(true);
      setError("Enter a GitHub token with Issues write permission before publishing.");
      return;
    }
    if (!selectedIssues.size) {
      setError("Select at least one issue to publish.");
      return;
    }
    if (!window.confirm(`Publish labels to ${selectedIssues.size} GitHub issues?`)) return;

    setError("");
    setNotice("");
    setPublishing(true);
    try {
      const assignments = result.classifications
        .filter((item) => selectedIssues.has(item.issueNumber))
        .map((item) => ({
          issueNumber: item.issueNumber,
          label: item.label,
          confidence: item.confidence,
        }));
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryUrl, githubToken, assignments }),
      });
      const data = await readApiResponse<{ published: number; skipped: number }>(response);
      setNotice(
        `Published ${data.published} label assignments to ${result.repository}.` +
          (data.skipped
            ? ` Skipped ${data.skipped} assignments below the minimum confidence.`
            : ""),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Publishing failed.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <main>
      <header className="hero">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <p className="eyebrow">Microsoft Decision-1</p>
            <h1>GitHub Issue Classifier</h1>
          </div>
        </div>

        <form className="repo-form" onSubmit={classify}>
          <label htmlFor="repository">GitHub repository</label>
          <div className="repo-input-row">
            <div className="url-input">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.87c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.58 9.58 0 0 1 12 6.82c.85 0 1.71.11 2.51.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.76c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
              </svg>
              <input
                id="repository"
                type="url"
                required
                value={repositoryUrl}
                onChange={(event) => setRepositoryUrl(event.target.value)}
                placeholder="https://github.com/owner/repository"
                autoComplete="url"
              />
            </div>
            <button className="primary-button" type="submit" disabled={loading || labels.length < 2}>
              {loading ? <span className="spinner" /> : "Go"}
            </button>
          </div>
          <button
            className="token-toggle"
            type="button"
            onClick={() => setShowToken((current) => !current)}
          >
            {showToken ? "Hide" : "Add"} GitHub token for private repos or publishing
          </button>
          {showToken && (
            <input
              className="token-input"
              type="password"
              value={githubToken}
              onChange={(event) => setGithubToken(event.target.value)}
              placeholder="Fine-grained token with Issues access"
              autoComplete="off"
            />
          )}
        </form>
      </header>

      <section className="workspace">
        <aside className="label-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Classification set</p>
              <h2>Issue labels</h2>
            </div>
            <span className="count-badge">{labels.length}</span>
          </div>
          <p className="panel-copy">
            Decision-1 will select the best matching label for every issue.
          </p>
          <div className="label-list">
            {labels.map((label, index) => (
              <div className="label-chip" key={label}>
                <span className={`label-dot color-${index % 5}`} />
                <span>{label}</span>
                <button
                  type="button"
                  onClick={() => setLabels(labels.filter((item) => item !== label))}
                  aria-label={`Remove ${label}`}
                  title={`Remove ${label}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="add-label">
            <input
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              onKeyDown={handleLabelKeyDown}
              placeholder="Add a label"
              maxLength={50}
            />
            <button type="button" onClick={addLabel} aria-label="Add label">
              +
            </button>
          </div>
          {labels.length < 2 && (
            <p className="field-error">Add at least two labels to classify issues.</p>
          )}
        </aside>

        <section className="results-panel">
          {error && <div className="alert error-alert">{error}</div>}
          {notice && <div className="alert success-alert">{notice}</div>}

          {!result && !loading && (
            <div className="empty-state">
              <div className="empty-graphic">
                <span className="issue-card card-one">?</span>
                <span className="issue-card card-two">✓</span>
                <span className="issue-card card-three">#</span>
              </div>
              <p className="eyebrow">Ready to organize</p>
              <h2>Turn an issue backlog into a clear queue.</h2>
              <p>
                Enter a repository, tune your labels, and Decision-1 will classify every
                issue with a confidence score.
              </p>
            </div>
          )}

          {loading && (
            <div className="loading-state">
              <div className="loader-rings" />
              <h2>Reading and classifying issues</h2>
              <p>Large repositories may take a few minutes.</p>
            </div>
          )}

          {result && !loading && (
            <>
              <div className="results-header">
                <div>
                  <p className="eyebrow">{result.repository}</p>
                  <h2>{result.issueCount} issues classified</h2>
                </div>
                <div className="result-actions">
                  <div className="confidence-summary">
                    <strong>{Math.round(averageConfidence * 100)}%</strong>
                    <span>avg. confidence</span>
                  </div>
                  <button
                    className="publish-button"
                    type="button"
                    onClick={publish}
                    disabled={publishing || selectedIssues.size === 0}
                  >
                    {publishing ? "Publishing…" : `Publish ${selectedIssues.size} labels`}
                  </button>
                </div>
              </div>

              {result.classifications.length === 0 ? (
                <div className="no-issues">This repository has no issues to classify.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            aria-label="Select all issues"
                            checked={
                              selectedIssues.size === result.classifications.length &&
                              result.classifications.length > 0
                            }
                            onChange={(event) =>
                              setSelectedIssues(
                                event.target.checked
                                  ? new Set(
                                      result.classifications.map((item) => item.issueNumber),
                                    )
                                  : new Set(),
                              )
                            }
                          />
                        </th>
                        <th>Issue</th>
                        <th>Classification</th>
                        <th>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.classifications.map((item) => (
                        <tr key={item.issueNumber}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Select issue ${item.issueNumber}`}
                              checked={selectedIssues.has(item.issueNumber)}
                              onChange={() => toggleIssue(item.issueNumber)}
                            />
                          </td>
                          <td>
                            <a href={item.htmlUrl} target="_blank" rel="noreferrer">
                              <span className="issue-number">#{item.issueNumber}</span>
                              {item.title}
                            </a>
                            {item.currentLabels.length > 0 && (
                              <small>Current: {item.currentLabels.join(", ")}</small>
                            )}
                          </td>
                          <td>
                            <select
                              value={item.label}
                              onChange={(event) =>
                                updateClassification(item.issueNumber, event.target.value)
                              }
                            >
                              {labels.map((label) => (
                                <option value={label} key={label}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <div className="confidence-cell">
                              <div className="confidence-track">
                                <span style={{ width: `${item.confidence * 100}%` }} />
                              </div>
                              <strong>{Math.round(item.confidence * 100)}%</strong>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </section>

      <footer>
        <span>Powered by Microsoft Decision-1</span>
        <span>Credentials are never stored</span>
      </footer>
    </main>
  );
}

export default App;
