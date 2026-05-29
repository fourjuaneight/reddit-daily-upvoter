import {
  PRIMARY_SUBREDDIT,
  FALLBACK_SUBREDDIT,
  SORT,
  SORT_TIME,
  TRIGGER_HOUR,
  TRIGGER_MINUTE,
  AUTO_CLOSE_TAB,
  MAX_LOG_ENTRIES,
} from './config';

export interface Config {
  primarySubreddit: string;
  fallbackSubreddit: string;
  sort: string;
  sortTime: string;
  triggerHour: number;
  triggerMinute: number;
  autoCloseTab: boolean;
}

export interface LogEntry {
  date: string;
  timestamp: number;
  subreddit: string;
  usedFallback: boolean;
  fallbackReason: string | null;
  result: 'success' | 'already_upvoted' | 'failed' | 'no_posts';
  postTitle: string | null;
  error: string | null;
}

export type MessageType =
  | { type: 'UPVOTE_SUCCESS'; subreddit: string; postTitle: string }
  | { type: 'UPVOTE_ALREADY_DONE'; subreddit: string }
  | { type: 'USE_FALLBACK'; reason: string }
  | { type: 'UPVOTE_FAILED'; reason: string }
  | { type: 'TRIGGER_NOW' };

export const DEFAULT_CONFIG: Config = {
  primarySubreddit: PRIMARY_SUBREDDIT,
  fallbackSubreddit: FALLBACK_SUBREDDIT,
  sort: SORT,
  sortTime: SORT_TIME,
  triggerHour: TRIGGER_HOUR,
  triggerMinute: TRIGGER_MINUTE,
  autoCloseTab: AUTO_CLOSE_TAB,
};

export { MAX_LOG_ENTRIES };
