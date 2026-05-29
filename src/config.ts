// ============================================================
// EDIT THESE VALUES TO CONFIGURE THE EXTENSION
// ============================================================

export const PRIMARY_SUBREDDIT = 'mtgporn';
export const FALLBACK_SUBREDDIT = 'crtgaming';

// 24-hour format
export const TRIGGER_HOUR = 9;
export const TRIGGER_MINUTE = 0;

// "top" sorted by "day" — Reddit URL becomes /r/{sub}/top/?t=day
export const SORT = 'top';
export const SORT_TIME = 'day';

// Close the tab after upvoting (or failing)
export const AUTO_CLOSE_TAB = true;

// Log filename dropped into Downloads folder on each event
export const LOG_FILENAME = 'reddit-upvoter-log.txt';

// Max entries kept in chrome.storage.local
export const MAX_LOG_ENTRIES = 30;

// Seconds to wait for Reddit feed to render before giving up
export const FEED_TIMEOUT_MS = 15_000;
