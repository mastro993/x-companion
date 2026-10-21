import type { Prompt } from './prompts/types';
import type { ModelOption, ProviderId } from './providers';

export interface LlmConfig {
  provider: ProviderId;
  apiKey: string;
  model: ModelOption;
}

const CHAT_BASE = {
  openai: 'https://api.openai.com/v1',
  xai: 'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
} as const;
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

// Holds reasoning tokens too (OpenAI, OpenRouter, Anthropic), so it can't be tight.
const MAX_OUTPUT_TOKENS = 2048;
const TIMEOUT_MS = 60_000;

const DECLINED = 'The model declined to reply to this post.';
const CUT_OFF = 'The reply was cut off by the token limit. Try again or pick another model.';
const EMPTY = 'The model returned an empty reply. Try again or pick another model.';

interface ApiError {
  // xAI sends a bare string; everyone else sends { message }.
  error?: string | { message?: string };
  // TypeSafe (Jev) sends { detail: { message } }, or a list of field errors on a 422.
  detail?: { message?: string };
}

interface ChatResponse {
  choices?: {
    finish_reason?: string | null;
    error?: { message?: string };
    message?: { content?: string | null; refusal?: string | null };
  }[];
}

interface AnthropicResponse {
  stop_reason?: string | null;
  content?: { type: string; text?: string }[];
}

// TypeSafe (Jev, see jev.ts) takes a plain bearer key.
function authHeaders(provider: ProviderId | 'typesafe', apiKey: string): Record<string, string> {
  if (provider === 'anthropic') {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Required for any request carrying an Origin header, e.g. chrome-extension://.
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }
  return {
    authorization: `Bearer ${apiKey}`,
    ...(provider === 'openrouter' && {
      'HTTP-Referer': 'https://github.com/mastro993/x-companion',
      'X-OpenRouter-Title': 'x-companion',
    }),
  };
}

function httpError(status: number, message: string): string {
  // xAI answers a bad key with 400 "Incorrect API key provided".
  if (status === 401 || (status === 400 && /api key/i.test(message))) return 'Invalid API key';
  if (status === 402) return 'Out of credits. Check billing with your provider.';
  if (status === 429) return 'Rate limit or quota reached. Wait a moment, or check your plan.';
  return `${status}: ${message}`;
}

const isTimeout = (e: unknown) => e instanceof DOMException && e.name === 'TimeoutError';

export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  timeoutMessage = 'The model took too long. Try a faster model.',
): Promise<T> {
  let res: Response;
  let raw: string;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    raw = await res.text();
  } catch (e) {
    throw new Error(isTimeout(e) ? timeoutMessage : 'Network error. Check your connection.');
  }
  let body: (T & ApiError) | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    // Non-JSON body (e.g. a proxy's HTML error page): fall back to the HTTP status.
  }
  const err = body?.error;
  const message =
    typeof err === 'string' ? err : err ? (err.message ?? 'Unknown error') : body?.detail?.message;
  if (!res.ok) {
    throw new Error(httpError(res.status, message || res.statusText || 'Request failed'));
  }
  // OpenRouter can fail with HTTP 200 and a top-level error.
  if (message) throw new Error(message);
  if (!body) throw new Error('Unexpected response from the provider.');
  return body;
}

export function postJson(provider: ProviderId | 'typesafe', apiKey: string, body: object): RequestInit {
  return {
    method: 'POST',
    headers: { ...authHeaders(provider, apiKey), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function chatText(res: ChatResponse): string {
  const c = res.choices?.[0];
  // OpenRouter: the upstream failed mid-generation; content may hold a partial reply.
  if (c?.error || c?.finish_reason === 'error') {
    throw new Error(c.error?.message ?? 'The provider failed to generate a reply.');
  }
  if (c?.message?.refusal) throw new Error(DECLINED);
  if (c?.finish_reason === 'length') throw new Error(CUT_OFF);
  return c?.message?.content ?? '';
}

function anthropicText(res: AnthropicResponse): string {
  if (res.stop_reason === 'refusal') throw new Error(DECLINED);
  if (res.stop_reason === 'max_tokens') throw new Error(CUT_OFF);
  // Skips thinking blocks, which adaptive-thinking models emit before the text.
  return (res.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
}

/** Throws Error with a short user-facing message on any failure. */
export async function generateText(cfg: LlmConfig, prompt: Prompt): Promise<string> {
  const { provider, apiKey, model } = cfg;
  // Never send temperature/top_p/top_k: current reasoning models reject them.
  const text =
    provider === 'anthropic'
      ? anthropicText(
          await fetchJson<AnthropicResponse>(
            `${ANTHROPIC_BASE}/messages`,
            postJson(provider, apiKey, {
              model: model.id,
              max_tokens: MAX_OUTPUT_TOKENS,
              system: prompt.system,
              messages: [{ role: 'user', content: prompt.user }],
              ...(model.lowEffort && { output_config: { effort: 'low' } }),
            }),
          ),
        )
      : chatText(
          await fetchJson<ChatResponse>(
            `${CHAT_BASE[provider]}/chat/completions`,
            postJson(provider, apiKey, {
              model: model.id,
              messages: [
                { role: 'system', content: prompt.system },
                { role: 'user', content: prompt.user },
              ],
              // Many OpenRouter models list only max_tokens; OpenAI and xAI deprecated it.
              [provider === 'openrouter' ? 'max_tokens' : 'max_completion_tokens']:
                MAX_OUTPUT_TOKENS,
              ...(model.lowEffort && { reasoning_effort: 'low' }),
              ...(provider === 'openai' && { store: false }),
            }),
          ),
        );
  if (!text.trim()) throw new Error(EMPTY);
  return text;
}

// /v1/models has no capability info. Keeps GPT-5+ chat models, which all accept effort "low";
// drops audio/realtime/image/search variants, Responses-only -pro/codex and dated snapshots.
const isOpenAiTextModel = (id: string) =>
  /^gpt-[5-9]/.test(id) &&
  !/(chat|audio|realtime|transcribe|tts|image|search|codex|pro|cyber|\d{4}-\d{2}-\d{2})/.test(id);

async function fetchModels(provider: ProviderId, apiKey: string): Promise<ModelOption[]> {
  const init = { headers: authHeaders(provider, apiKey) };
  const timeout = 'Loading models timed out. Try again.';
  switch (provider) {
    case 'openai': {
      const { data } = await fetchJson<{ data?: { id: string }[] }>(
        `${CHAT_BASE.openai}/models`,
        init,
        timeout,
      );
      return (data ?? [])
        .filter((m) => isOpenAiTextModel(m.id))
        .map((m) => ({ id: m.id, label: m.id, lowEffort: true }));
    }
    case 'xai': {
      const { models } = await fetchJson<{
        models?: {
          id: string;
          output_modalities?: string[];
          capabilities?: { reasoning_effort?: string[] };
        }[];
      }>(`${CHAT_BASE.xai}/language-models`, init, timeout);
      return (models ?? [])
        .filter((m) => m.output_modalities?.includes('text') && !m.id.includes('multi-agent'))
        .map((m) => ({
          id: m.id,
          label: m.id,
          // capabilities is optional; models without it are reasoning ones unless named otherwise.
          lowEffort:
            m.capabilities?.reasoning_effort?.includes('low') ?? !m.id.includes('non-reasoning'),
        }));
    }
    case 'openrouter': {
      // /models is public, so /key is what validates the key.
      const [, { data }] = await Promise.all([
        fetchJson(`${CHAT_BASE.openrouter}/key`, init, timeout),
        fetchJson<{
          data?: {
            id: string;
            name?: string;
            architecture?: { output_modalities?: string[] };
            reasoning?: { supported_efforts?: string[] };
          }[];
        }>(`${CHAT_BASE.openrouter}/models`, init, timeout),
      ]);
      return (data ?? [])
        .filter((m) => {
          const out = m.architecture?.output_modalities;
          return out?.length === 1 && out[0] === 'text' && !m.id.endsWith(':batch');
        })
        .map((m) => ({
          id: m.id,
          label: m.name ?? m.id,
          lowEffort: m.reasoning?.supported_efforts?.includes('low') === true,
        }));
    }
    case 'anthropic': {
      // Array query param in the SDK's bracket format; the default list includes deprecated models.
      const { data } = await fetchJson<{
        data?: {
          id: string;
          display_name?: string;
          capabilities?: { effort?: { low?: { supported?: boolean } } } | null;
        }[];
      }>(`${ANTHROPIC_BASE}/models?limit=1000&lifecycle%5B%5D=active`, init, timeout);
      return (data ?? []).map((m) => ({
        id: m.id,
        label: m.display_name ?? m.id,
        lowEffort: m.capabilities?.effort?.low?.supported === true,
      }));
    }
  }
}

/**
 * Fetches + filters text models for the key. Doubles as key validation: throws
 * Error('Invalid API key') on auth failure. Sorted for display.
 */
export async function listModels(provider: ProviderId, apiKey: string): Promise<ModelOption[]> {
  return (await fetchModels(provider, apiKey)).sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}
