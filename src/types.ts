export interface Session {
  session_id: string;
  cwd: string;
  project_name: string;
  status: "active" | "pinned" | "archived";
  summary: string;
  started_at: string;
  last_activity_at: string;
  ended_at: string | null;
  source: string;
  prompt_count: number;
  stop_count: number;
  transcript_path: string;
  pinned: boolean;
}

export interface SessionsData {
  version: 1;
  sessions: Record<string, Session>;
}

export interface HookInput {
  hook_event_name: string;
  session_id: string;
  cwd?: string;
  transcript_path?: string;
  prompt?: string;
  source?: string;
  [key: string]: unknown;
}
