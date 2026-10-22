/** A photo, or a video's thumbnail. */
export interface PostImage {
  url: string; // https://pbs.twimg.com/…, sized for a vision model
  alt: string; // "" when X shows none
  video: boolean;
}

export interface Post {
  author: string; // "@handle" or ""
  text: string; // post text, emoji included (img alt)
  images: PostImage[]; // the post's own media, not the quoted post's
  truncated: boolean; // "Show more" present
  quoted: Post | null; // the post it quotes; a quoted post never has one
}

/** The post being replied to, with the conversation the page shows around it. */
export interface TargetPost extends Post {
  earlier: Post[]; // posts above it in the conversation, oldest first
  later: Post[]; // its author's posts right below it: the rest of their thread
}

/** Reply composer actions. `reply` drafts into an empty box; the others rewrite the box's text. */
export const ACTIONS = ['reply', 'polish', 'punchier', 'match-style'] as const;
export type ActionId = (typeof ACTIONS)[number];

/** Longest post text and draft the background accepts. */
export const MAX_TEXT = 8000;

/** content script -> background */
export type BackgroundRequest =
  | { type: 'get-status' }
  | { type: 'open-side-panel' }
  | { type: 'run-action'; action: ActionId; post: TargetPost; draft: string; me: string }
  | { type: 'refine-post'; draft: string }; // a new post's draft, never empty

/** background -> content script (pushed via tabs.sendMessage when settings change) */
export type ContentPush = { type: 'status'; ready: boolean };
export type StatusResponse = { ready: boolean };
export type ActionResponse = { ok: true; text: string } | { ok: false; error: string };
