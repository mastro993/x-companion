import { rewritePrompt } from './rewrite';

/** Closer to the user's style guide, changing only what's needed. */
export const matchStylePrompt = rewritePrompt(
  'Rewrite this to better match my personal voice and writing style. Pay close attention to the current content to make sure you understand the goal and context of this specific post, and then only make the necessary changes so it genuinely sounds like me.',
);
