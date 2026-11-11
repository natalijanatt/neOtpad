import { Logger } from '@nestjs/common';
import type { AppMaterijalOtpada } from '../../database/generated/schema';
import { isMaterijal } from '../materijal';
import { normalize } from './keyword-classifier';
import { RESPONSE_FORMAT, systemPrompt, UNKNOWN } from './prompt';
import type { Classification, WasteClassifier } from './waste-classifier.port';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

/**
 * Identical questions ("frizider", "stari frizider") are the common case, and
 * each model call is paid. A small in-process memo saves most of that; it is
 * bounded so a flood of unique junk cannot grow it without limit.
 */
const CACHE_SIZE = 500;

export interface OpenAiClassifierOptions {
  apiKey: string;
  model: string;
  /** Past this the keyword answer is better than a spinner on a village connection. */
  timeoutMs: number;
}

/**
 * Classification through the OpenAI Chat Completions API with strict structured
 * output. Plain `fetch` rather than the SDK: one POST, and the SDK's own retries
 * are exactly what is not wanted here — a failed call falls back to keywords at
 * once instead of retrying while the citizen waits.
 *
 * No `temperature`: the configured model (gpt-5.6-luna) accepts only its
 * default, and the enum-constrained output is already deterministic enough.
 */
export class OpenAiWasteClassifier implements WasteClassifier {
  private readonly logger = new Logger(OpenAiWasteClassifier.name);
  private readonly cache = new Map<string, AppMaterijalOtpada | null>();
  private readonly prompt = systemPrompt();

  constructor(
    private readonly options: OpenAiClassifierOptions,
    private readonly fallback: WasteClassifier,
  ) {}

  async classify(text: string): Promise<Classification> {
    const key = normalize(text);
    if (this.cache.has(key)) return { materijal: this.cache.get(key) ?? null, izvor: 'openai' };

    try {
      const materijal = await this.ask(text);
      this.remember(key, materijal);
      return { materijal, izvor: 'openai' };
    } catch (error) {
      // Logged, not thrown: the fallback answer is a correct response, and the
      // log is how a broken key or a retired model gets noticed.
      this.logger.warn(`OpenAI classification failed (${this.options.model}), using keywords: ${error instanceof Error ? error.message : String(error)}`);
      return this.fallback.classify(text);
    }
  }

  private async ask(text: string): Promise<AppMaterijalOtpada | null> {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.options.model,
        messages: [
          { role: 'system', content: this.prompt },
          { role: 'user', content: text },
        ],
        response_format: RESPONSE_FORMAT,
        // The answer is ~20 tokens. The headroom is for models that reason
        // first; running out yields broken JSON, which falls back cleanly.
        max_completion_tokens: 200,
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('empty answer');

    // Structured output makes this the schema's shape — checked again anyway,
    // because the value flows into a SQL enum and a UI label.
    const value: unknown = (JSON.parse(content) as { materijal?: unknown }).materijal;
    if (value === UNKNOWN) return null;
    if (!isMaterijal(value)) throw new Error(`unexpected category "${String(value)}"`);
    return value;
  }

  private remember(key: string, materijal: AppMaterijalOtpada | null): void {
    if (this.cache.size >= CACHE_SIZE) {
      // Oldest insertion first: Map iterates in insertion order.
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, materijal);
  }
}
