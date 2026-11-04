/** A language model behind one tiny interface: structured JSON out, given a schema. */
import type { JsonSchema } from '../../core/llm/schemas.ts';

export interface JsonRequest {
  system: string;
  user: string;
  schema: JsonSchema;
  /** A short name for the schema (tools/structured-output APIs want one). */
  name: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface LlmProvider {
  /** e.g. "local", "anthropic", "openai", "openrouter", "gemini". */
  readonly id: string;
  readonly model: string;
  /** "local" never sends data off the machine. */
  readonly locality: 'local' | 'cloud';
  json<T = unknown>(req: JsonRequest): Promise<T>;
  dispose?(): Promise<void>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}
