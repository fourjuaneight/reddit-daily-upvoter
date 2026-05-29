import { Config, LogEntry, DEFAULT_CONFIG, MAX_LOG_ENTRIES } from './types';

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
}

export async function hasUpvotedToday(): Promise<boolean> {
  const log = await getLog();
  if (log.length === 0) return false;
  const today = new Date().toISOString().split('T')[0];
  return log[0].date === today && log[0].result === 'success';
}

