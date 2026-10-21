import type { TargetPost } from '../messages';
import type { Project, StyleGuide } from '../settings';

/** What a provider receives: instructions and the user's profile, then the material. */
export interface Prompt {
  system: string;
  user: string;
}

/** What the prompt works on: the post being replied to and the reply box's text ('' when empty). */
export interface PromptContext {
  post: TargetPost;
  draft: string;
}

/** Everything a prompt can draw on. Every builder gets all of it and uses what it needs. */
export interface PromptConfig {
  context: PromptContext;
  style: StyleGuide;
  projects: Project[];
}

export type PromptBuilder = (config: PromptConfig) => Prompt;
