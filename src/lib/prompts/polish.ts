import { rewritePrompt } from './rewrite';

/** Smallest useful fixes, in the user's voice. */
export const polishPrompt = rewritePrompt(`Polish the draft:

Apply the fixes directly; don't only list issues.

Make the smallest useful edits:

- Fix typos, grammar, punctuation, and obvious wrong words
- Smooth awkward or unclear phrasing with local edits
- Preserve my voice, meaning, post order, structure, and formatting

Never hold back the polished version or ask for approval before applying local fixes. If no changes are needed, return the draft unchanged.`);
