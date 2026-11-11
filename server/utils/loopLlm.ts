import { LOOP_SENTENCE_JSON_SCHEMA, LOOP_SENTENCE_PROMPT } from '../../shared/utils/loopSentence'

// The LLM reading a loop sentence (#216), one small adapter per provider: each sends the shared prompt and JSON
// schema and gives back the provider's raw JSON, which the caller checks with `loopUnderstandingSchema`. No
// Nitro auto-import here, so the reference sentences (`test/llm/`) can call it from Vitest.

export interface LoopLlmOptions {
  provider: string
  key: string
  model: string
  // The provider's own endpoint when empty.
  url?: string
  timeoutMs?: number
}

export class LoopLlmError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
  }
}

type Adapter = (sentence: string, options: LoopLlmOptions, signal: AbortSignal) => Promise<unknown>

// OpenAI-compatible chat completions with a strict JSON schema: Groq, and any provider speaking the same API
// (Gemini's OpenAI endpoint, OpenAI) through NUXT_LOOP_LLM_URL.
const chatCompletions = (defaultUrl: string, extra: Record<string, unknown> = {}): Adapter => async (sentence, options, signal) => {
  const response = await fetch(options.url || defaultUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${options.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model,
      temperature: 0,
      max_completion_tokens: 1500,
      messages: [
        { role: 'system', content: LOOP_SENTENCE_PROMPT },
        { role: 'user', content: sentence },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'loop_sentence', strict: true, schema: LOOP_SENTENCE_JSON_SCHEMA } },
      ...extra,
    }),
    signal,
  })
  if (!response.ok) throw new LoopLlmError(`LLM answered ${response.status}: ${(await response.text()).slice(0, 300)}`, response.status)
  const body = await response.json() as { choices?: { message?: { content?: string } }[] }
  const content = body.choices?.[0]?.message?.content
  if (!content) throw new LoopLlmError('LLM answered without content')
  try {
    return JSON.parse(content)
  }
  catch {
    throw new LoopLlmError('LLM answered something else than JSON')
  }
}

const ADAPTERS: Record<string, Adapter> = {
  // gpt-oss: a little reasoning is enough for one sentence, and keeps its reasoning out of the answer.
  groq: chatCompletions('https://api.groq.com/openai/v1/chat/completions', { reasoning_effort: 'low', include_reasoning: false }),
  openai: chatCompletions('https://api.openai.com/v1/chat/completions'),
}

export async function askLoopLlm(sentence: string, options: LoopLlmOptions): Promise<unknown> {
  const adapter = ADAPTERS[options.provider]
  if (!adapter) throw new LoopLlmError(`Unknown LLM provider ${options.provider}`)
  try {
    return await adapter(sentence, options, AbortSignal.timeout(options.timeoutMs ?? 15_000))
  }
  catch (error) {
    if (error instanceof LoopLlmError) throw error
    throw new LoopLlmError(`LLM call failed: ${(error as Error).message}`)
  }
}
