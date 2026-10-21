export interface TargetPost {
  author: string; // "@handle" or ""
  text: string; // post text, emoji included (img alt)
  quoted: string; // quoted post text or ""
  images: string[]; // alt texts of the post's own photos
  truncated: boolean; // "Show more" present
}

/** content script -> background */
export type BackgroundRequest =
  | { type: 'get-status' }
  | { type: 'open-side-panel' }
  | { type: 'generate-reply'; post: TargetPost };

/** background -> content script (pushed via tabs.sendMessage when settings change) */
export type ContentPush = { type: 'status'; ready: boolean };
export type StatusResponse = { ready: boolean };
export type GenerateReplyResponse = { ok: true; text: string } | { ok: false; error: string };
