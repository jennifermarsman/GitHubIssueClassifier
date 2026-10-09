import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv/config", () => ({}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("TYPESAFE_BASE_URL", "https://example.com");
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("minimum label confidence configuration", () => {
  it("defaults to 75 when unset", async () => {
    vi.stubEnv("MIN_LABEL_CONFIDENCE", undefined);
    const { getConfig } = await import("../server/config.js");
    expect(getConfig().MIN_LABEL_CONFIDENCE).toBe(75);
  });

  it("reads a configured percentage", async () => {
    vi.stubEnv("MIN_LABEL_CONFIDENCE", "82.5");
    const { getConfig } = await import("../server/config.js");
    expect(getConfig().MIN_LABEL_CONFIDENCE).toBe(82.5);
  });

  it.each(["-1", "101", "not-a-number"])("rejects invalid value %s", async (value) => {
    vi.stubEnv("MIN_LABEL_CONFIDENCE", value);
    const { getConfig } = await import("../server/config.js");
    expect(() => getConfig()).toThrow();
  });
});
