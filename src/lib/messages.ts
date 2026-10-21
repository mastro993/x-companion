export interface TargetPost {
  author: string; // "@handle" or ""
  text: string; // post text, emoji included (img alt)
  quoted: string; // quoted post text or ""
  images: string[]; // alt texts of the post's own photos
  truncated: boolean; // "Show more" present
}

/** Composer actions. `reply` drafts into an empty box; the others rewrite the box's text. */
export const ACTIONS = ['reply', 'polish', 'punchier', 'match-style'] as const;
export type ActionId = (typeof ACTIONS)[number];

/** Longest post text and draft the background accepts. */
export const MAX_TEXT = 8000;

/** content script -> background */
export type BackgroundRequest =
  | { type: 'get-status' }
  | { type: 'open-side-panel' }
  | { type: 'run-action'; action: ActionId; post: TargetPost; draft: string };

/** background -> content script (pushed via tabs.sendMessage when settings change) */
export type ContentPush = { type: 'status'; ready: boolean };
export type StatusResponse = { ready: boolean };
export type ActionResponse = { ok: true; text: string } | { ok: false; error: string };
