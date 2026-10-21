import type { ActionId } from '../messages';
import { matchStylePrompt } from './match-style';
import { polishPrompt } from './polish';
import { punchierPrompt } from './punchier';
import { replyPrompt } from './reply';
import type { PromptBuilder } from './types';

/** One prompt per composer action. A new action goes in ACTIONS (messages.ts), then here. */
export const PROMPTS: Record<ActionId, PromptBuilder> = {
  reply: replyPrompt,
  polish: polishPrompt,
  punchier: punchierPrompt,
  'match-style': matchStylePrompt,
};
