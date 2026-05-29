import { Config, LogEntry, DEFAULT_CONFIG, MAX_LOG_ENTRIES } from './types';
import { LOG_FILENAME } from './config';

export async function getConfig(): Promise<Config> {
  const result = await chrome.storage.local.get('config');
  return { ...DEFAULT_CONFIG, ...result.config };
}

export async function saveConfig(config: Config): Promise<void> {
  await chrome.storage.local.set({ config });
}

export async function getLog(): Promise<LogEntry[]> {
  const result = await chrome.storage.local.get('log');
  return result.log ?? [];
}

export async function addLogEntry(entry: LogEntry): Promise<void> {
  const log = await getLog();
  log.unshift(entry);
  if (log.length > MAX_LOG_ENTRIES) {
    log.length = MAX_LOG_ENTRIES;
  }
  await chrome.storage.local.set({ log });

  // Append to persistent log file via downloads API
  appendToLogFile(entry);
}

export async function hasUpvotedToday(): Promise<boolean> {
  const log = await getLog();
  if (log.length === 0) return false;
  const today = new Date().toISOString().split('T')[0];
  return log[0].date === today && log[0].result === 'success';
}

// Downloads API appends a line to a text file in the user's Downloads folder.
// Chrome overwrites same-name files by default, so we fetch existing content
// from storage and re-download the full log each time.
function appendToLogFile(entry: LogEntry): void {
  const line = formatLogLine(entry);

  chrome.storage.local.get('logFileContent', (result) => {
    const existing: string = result.logFileContent ?? '';
    const updated = existing + line + '\n';
    chrome.storage.local.set({ logFileContent: updated }, () => {
      const blob = new Blob([updated], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download(
        {
          url,
          filename: LOG_FILENAME,
          conflictAction: 'overwrite',
          saveAs: false,
        },
        () => URL.revokeObjectURL(url)
      );
    });
  });
}

function formatLogLine(entry: LogEntry): string {
  const ts = new Date(entry.timestamp).toISOString();
  const parts = [`[${ts}]`, entry.result.toUpperCase(), `r/${entry.subreddit}`];
  if (entry.usedFallback) parts.push(`(fallback: ${entry.fallbackReason})`);
  if (entry.postTitle) parts.push(`"${entry.postTitle}"`);
  if (entry.error) parts.push(`ERROR: ${entry.error}`);
  return parts.join(' | ');
}
