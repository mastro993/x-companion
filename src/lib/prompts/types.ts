import type { TargetPost } from '../messages';
import type { Project, StyleGuide } from '../settings';

/** A picture sent beside the text. `label` matches its [label] marker in `user`. */
export interface PromptImage {
  label: string;
  url: string;
}

/** What a provider receives: instructions and the user's profile, then the material. */
export interface Prompt {
  system: string;
  user: string;
  images: PromptImage[];
}

/** What the prompt works on: the post being replied to and the reply box's text ('' when empty). */
export interface PromptContext {
  post: TargetPost;
  draft: string;
  me: string; // the user's "@handle", or "" when the page didn't show it
}

/** Everything a prompt can draw on. Every builder gets all of it and uses what it needs. */
export interface PromptConfig {
  context: PromptContext;
  style: StyleGuide;
  projects: Project[];
}

export type PromptBuilder = (config: PromptConfig) => Prompt;
