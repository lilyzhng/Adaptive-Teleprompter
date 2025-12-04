export interface ScriptWord {
  id: string;
  word: string;
  cleanWord: string;
  isSpoken: boolean;
  isParagraphStart?: boolean;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface TeleprompterConfig {
  fontSize: number;
  opacity: number;
  scrollSpeed: number; // Manual offset if needed, though we use auto
}