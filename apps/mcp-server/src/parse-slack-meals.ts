import { writeSlackMealCandidateFile } from "./slack-meal-parser.ts";

try {
  const result = await writeSlackMealCandidateFile();
  console.log(JSON.stringify(result.summary, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
