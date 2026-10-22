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

/** The user's style guide and projects, from the side panel. */
export interface Profile {
  style: StyleGuide;
  projects: Project[];
}

/** Everything a reply prompt can draw on. Every builder gets all of it and uses what it needs. */
export interface PromptConfig extends Profile {
  context: PromptContext;
}

export type PromptBuilder = (config: PromptConfig) => Prompt;

/** A new post's prompt: the user's draft, never empty. */
export type PostPromptBuilder = (config: Profile & { draft: string }) => Prompt;
