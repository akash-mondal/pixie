// LLM Client — Groq gpt-oss-120b via OpenAI-compatible Responses API

import OpenAI from 'openai';
import { createHash } from 'crypto';

let client: OpenAI | null = null;
let modelId: string = 'openai/gpt-oss-120b';
let totalInputTokens = 0;
let totalOutputTokens = 0;

export function initLLM(apiKey: string, model?: string) {
  client = new OpenAI({
    apiKey,
    baseURL: 'https://api.groq.com/openai/v1',
  });
  if (model) modelId = model;
}

export function getLLMUsage() {
  return { inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
}

interface LLMCallOptions {
  instructions: string;
  input: string;
  reasoning?: 'none' | 'low' | 'medium' | 'high';
  jsonSchema?: { name: string; schema: object; strict?: boolean };
}

interface LLMResult {
  text: string;
  parsed: any;
}

const FALLBACK_MODEL = 'openai/gpt-oss-20b';

export async function callLLM(opts: LLMCallOptions): Promise<LLMResult> {
  if (!client) throw new Error('LLM not initialized. Call initLLM() first.');

  for (const currentModel of [modelId, FALLBACK_MODEL]) {
    for (let retry = 0; retry < 3; retry++) {
      try {
        const params: any = {
          model: currentModel,
          instructions: opts.instructions,
          input: [{ role: 'user', content: opts.input }],
        };

        if (opts.reasoning) {
          params.reasoning = { effort: opts.reasoning };
        }
        if (opts.jsonSchema) {
          params.text = {
            format: {
              type: 'json_schema',
              ...opts.jsonSchema,
            },
          };
        }

        const response = await (client as any).responses.create(params);

        const text = response.output_text || '';
        let parsed: any = null;
        if (opts.jsonSchema) {
          try { parsed = JSON.parse(text); } catch { parsed = null; }
        }

        const usage = response.usage || {};
        totalInputTokens += usage.input_tokens || 0;
        totalOutputTokens += usage.output_tokens || 0;

        return { text, parsed };
      } catch (err: any) {
        const status = err.status || err.statusCode || 0;
        const msg = err.message || '';
        const isRetryable = status === 429 || status >= 500
          || (status === 400 && (msg.includes('Failed to generate JSON') || msg.includes('Failed to validate JSON')));

        if (isRetryable) {
          const delay = Math.pow(2, retry) * 1000;
          console.warn(`  [LLM] ${currentModel} error ${status}, retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        break; // non-retryable, try fallback
      }
    }

    if (currentModel === modelId && currentModel !== FALLBACK_MODEL) {
      console.warn(`  [LLM] ${modelId} failed, trying ${FALLBACK_MODEL}...`);
    }
  }

  throw new Error('All LLM attempts failed');
}
