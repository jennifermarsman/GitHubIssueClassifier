import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  TYPESAFE_BASE_URL: z.url(),
  TYPESAFE_API_KEY: z.string().min(1),
  TYPESAFE_DEFAULT_MODEL: z.string().min(1).default("microsoft-decision-1"),
  PORT: z.coerce.number().int().positive().default(3000),
  MIN_LABEL_CONFIDENCE: z.coerce.number().min(0).max(100).default(75),
});

export type AppConfig = z.infer<typeof environmentSchema>;

let cachedConfig: AppConfig | undefined;

export function getConfig(): AppConfig {
  cachedConfig ??= environmentSchema.parse(process.env);
  return cachedConfig;
}
