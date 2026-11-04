/**
 * Local model in-process via node-llama-cpp (prebuilt llama.cpp for macOS Metal, Windows/Linux CPU/CUDA/Vulkan).
 * Output is constrained by a GBNF grammar compiled from the JSON schema, so it always parses. Thinking is off
 * (budgets.thoughtTokens = 0) for speed. One model instance is shared and calls are serialised.
 */
import type { Llama, LlamaContext, LlamaContextSequence, LlamaModel } from 'node-llama-cpp';
import { LlmError, type JsonRequest, type LlmProvider } from './types.ts';

export interface LocalOptions {
  modelPath: string;
  /** Display id, e.g. "qwen3.5-4b-q4_k_m". */
  modelId: string;
  contextSize?: number;
  gpuLayers?: 'auto' | number;
}

export class LocalLlm implements LlmProvider {
  readonly id = 'local';
  readonly locality = 'local' as const;
  readonly model: string;
  private state: Promise<{
    llama: Llama;
    model: LlamaModel;
    ctx: LlamaContext;
    seq: LlamaContextSequence;
  }> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly opts: LocalOptions) {
    this.model = opts.modelId;
  }

  private load() {
    this.state ??= (async () => {
      const { getLlama } = await import('node-llama-cpp');
      const llama = await getLlama();
      const model = await llama.loadModel({
        modelPath: this.opts.modelPath,
        gpuLayers: this.opts.gpuLayers ?? 'auto',
      });
      const ctx = await model.createContext({ contextSize: this.opts.contextSize ?? 12288, sequences: 1 });
      // one sequence for the life of the model; every call starts from a cleared history
      return { llama, model, ctx, seq: ctx.getSequence() };
    })().catch((e: unknown) => {
      this.state = null; // a failed load must not stick until restart
      throw e;
    });
    return this.state;
  }

  async json<T>(req: JsonRequest): Promise<T> {
    const run = async (): Promise<T> => {
      const { llama, seq } = await this.load();
      const { LlamaChatSession, QwenChatWrapper } = await import('node-llama-cpp');
      await seq.clearHistory();
      let session: InstanceType<typeof LlamaChatSession> | undefined;
      try {
        // Qwen 3.x: discourage thinking via the chat template (a thought budget of 0 swallowed the first JSON token)
        const isQwen = /qwen3/i.test(this.model);
        session = new LlamaChatSession({
          contextSequence: seq,
          autoDisposeSequence: false,
          systemPrompt: req.system,
          ...(isQwen
            ? {
                chatWrapper: new QwenChatWrapper({
                  thoughts: 'discourage',
                  variation: /qwen3\.5/i.test(this.model) ? '3.5' : '3',
                }),
              }
            : {}),
        });
        const grammar = await llama.createGrammarForJsonSchema(req.schema as never);
        const out = await session.prompt(req.user, {
          grammar,
          maxTokens: req.maxTokens ?? 2048,
          temperature: req.temperature ?? 0.3,
          signal: req.signal,
          ...(isQwen ? {} : { budgets: { thoughtTokens: 0 } }),
        });
        try {
          return grammar.parse(out) as T;
        } catch (e) {
          throw new LlmError(`local model returned invalid JSON: ${(e as Error).message}`, this.id, true);
        }
      } finally {
        session?.dispose({ disposeSequence: false });
      }
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  async dispose(): Promise<void> {
    if (!this.state) return;
    const s = await this.state;
    await s.ctx.dispose();
    await s.model.dispose();
    this.state = null;
  }
}
