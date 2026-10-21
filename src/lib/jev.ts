import { fetchJson, postJson } from './llm';

// Jev is TypeSafe's decision model: it answers typed questions about some state with
// probabilities, not text. OpenRouter serves TypeSafe's System One API under its own base URL
// and maps bare model IDs onto its typesafe/ namespace, so both routes send the same request.
// Nothing calls this yet.
const BASE = {
  typesafe: 'https://api.typesafe.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
} as const;
// TypeSafe points this alias at its newest stable release, OpenRouter at its newest release.
// To pin one, the IDs differ too: jev-1.14.0 on TypeSafe, jev-1.14 on OpenRouter.
const MODEL = 'jev-latest';

export interface JevConfig {
  /** `typesafe` takes a TypeSafe console key; `openrouter` takes an OpenRouter key, billed there. */
  via: keyof typeof BASE;
  apiKey: string;
}

/** Text, or JSON that structures it. Used for the state and for every part of a question. */
export type JevContent = string | Record<string, unknown> | unknown[];

export type JevQuestion =
  /** Yes or no. Criteria, if any, say what counts as each. */
  | { type: 'noul'; instructions?: JevContent; criteria?: { true?: JevContent; false?: JevContent } }
  /** One of up to 255 options, keyed by name. A null description lets the name speak for itself. */
  | { type: 'choice'; instructions?: JevContent; criteria: Record<string, JevContent | null> }
  /** Up to 10 ordered levels, lowest first. */
  | { type: 'score'; instructions?: JevContent; criteria: readonly JevContent[] };

export interface NoulAnswer {
  type: 'noul';
  /** Probability of yes, from 0 to 1. */
  noul: number;
}

export interface ChoiceAnswer<Option extends string = string> {
  type: 'choice';
  choice: Option;
  confidence: number;
  probabilities: Record<Option, number>;
}

export interface ScoreAnswer {
  type: 'score';
  /** Probability-weighted level index, so it can fall between levels. */
  score: number;
  confidence: number;
  /** Keyed by level index: "0" is criteria[0]. */
  probabilities: Record<string, number>;
}

// JSON sends an option written as a number key ({ 5: '…' }) as a string, so the answer does too.
type AnswerTo<Q> = Q extends { type: 'choice'; criteria: infer C }
  ? ChoiceAnswer<`${Extract<keyof C, string | number>}`>
  : Q extends { type: 'score' }
    ? ScoreAnswer
    : NoulAnswer;

/** Answers keyed by question name, each typed by its question. */
export type JevAnswers<Qs> = { [K in keyof Qs]: AnswerTo<Qs[K]> };

/** Asks every question about `state` in one request. Throws Error with a short message on failure. */
export async function decide<const Qs extends Record<string, JevQuestion>>(
  { via, apiKey }: JevConfig,
  state: JevContent,
  questions: Qs,
): Promise<JevAnswers<Qs>> {
  const { answers } = await fetchJson<{ answers?: JevAnswers<Qs> }>(
    `${BASE[via]}/systemone`,
    postJson(via, apiKey, { model: MODEL, state, questions }),
    'Jev took too long. Try again.',
  );
  if (!answers) throw new Error('Unexpected response from the provider.');
  return answers;
}
