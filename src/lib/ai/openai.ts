import OpenAI from "openai";

const defaultOpenAIModel = "gpt-5.5";

export class OpenAIConfigurationError extends Error {
  constructor(message = "OPENAI_API_KEY is not configured") {
    super(message);
    this.name = "OpenAIConfigurationError";
  }
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL?.trim() || defaultOpenAIModel;
}

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new OpenAIConfigurationError();
  }

  return new OpenAI({ apiKey });
}
