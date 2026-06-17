import { collectSlackMealRawFromEnv } from "./slack-meal-collector.ts";

try {
  const result = await collectSlackMealRawFromEnv();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
