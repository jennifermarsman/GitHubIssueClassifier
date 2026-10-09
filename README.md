# GitHub Issue Classifier
Demonstration of Microsoft-Decision-1 model to classify GitHub issues

A web application that uses Microsoft Decision-1 to classify every
issue in a GitHub repository. Review the model's decisions and confidence
scores, adjust individual labels, then optionally publish the selected labels
back to GitHub.

The application is a React/Vite frontend with an Express/TypeScript backend.
Production builds are served as one Node.js process, making the project easy to
deploy to Azure App Service.

## Features

- Accepts public or private `github.com` repository URLs
- Starts with GitHub's default `bug`, `documentation`, `enhancement`, `invalid`,
  and `question` labels
- Lets users add and remove candidate labels
- Classifies open and closed issues with Microsoft-Decision-1's `Choice` decision
- Displays per-issue confidence and allows a human to change each result
- Publishes selected labels using a user-provided fine-grained GitHub token
- Keeps Microsoft-Decision-1 credentials on the server and never stores GitHub tokens

## Local development

Requires Node.js 20 or newer.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example configuration:

   ```bash
   cp .env.example .env
   ```

3. Set the Microsoft-Decision-1 values in `.env`:

   ```dotenv
   TYPESAFE_BASE_URL=your-endpoint
   TYPESAFE_API_KEY=your-api-key
   TYPESAFE_DEFAULT_MODEL=microsoft-decision-1
   MIN_LABEL_CONFIDENCE=75
   ```

   `MIN_LABEL_CONFIDENCE` is the minimum confidence percentage (0-100) required
   to publish a label, defaulting to 75 when unset. Selected assignments below
   this threshold are skipped without creating or applying their labels on
   GitHub, including assignments whose labels were manually changed. The
   publish result reports published and skipped counts.

4. Start the frontend and API:

   ```bash
   npm run dev
   ```

Open `http://localhost:5173`.

## GitHub access

Public repositories can be classified without a GitHub token. Private
repositories and publishing require a fine-grained personal access token:

- Repository access: the target repository
- Repository permission: **Issues — Read and write**

The browser sends this token only with classification or publishing requests.
The server uses it for the corresponding GitHub API calls and does not persist
it.

## Azure App Service

1. Create a Linux Web App that uses Node.js 20 or newer.
2. Configure deployment from this repository.
3. Add these App Service application settings:
   - `TYPESAFE_BASE_URL`
   - `TYPESAFE_API_KEY`
   - `TYPESAFE_DEFAULT_MODEL`
   - `MIN_LABEL_CONFIDENCE` (optional; defaults to `75`)
4. Use `npm run build` as the build command and `npm start` as the startup
   command.

App Service provides `PORT`; the server reads it automatically.

## Commands

```bash
npm run dev        # Run the Vite and Express development servers
npm run typecheck  # Type-check frontend and backend
npm test           # Run tests
npm run build      # Create the production build
npm start          # Serve the production build
```
