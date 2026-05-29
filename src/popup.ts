import { getConfig, getLog } from './storage';

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function formatTime(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

async function render(): Promise<void> {
  const config = await getConfig();
  const log = await getLog();

  // Next run
  const now = new Date();
  const scheduled = new Date();
  scheduled.setHours(config.triggerHour, config.triggerMinute, 0, 0);
  const isToday = scheduled > now;
  const dayLabel = isToday ? 'Today' : 'Tomorrow';
  $('nextRun').textContent =
    `${dayLabel} at ${formatTime(config.triggerHour, config.triggerMinute)}`;

  // Last run
  if (log.length > 0) {
    const last = log[0];
    const resultText: Record<string, string> = {
      success: 'Upvoted',
      already_upvoted: 'Already upvoted',
      failed: 'Failed',
      no_posts: 'No posts found',
    };
    $('lastRun').textContent =
      `${last.date} — r/${last.subreddit} — ${resultText[last.result] ?? last.result}`;
    if (last.error) {
      $('lastError').textContent = last.error;
    }
  } else {
    $('lastRun').textContent = 'No runs yet';
  }
}

$('triggerBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'TRIGGER_NOW' });
  $('triggerBtn').textContent = 'Triggered!';
  setTimeout(() => {
    $('triggerBtn').textContent = 'Run Now';
  }, 2000);
});

$('exportBtn').addEventListener('click', async () => {
  const result = await chrome.storage.local.get('logFileContent');
  const content: string = result.logFileContent ?? 'No log entries yet.\n';
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({
    url,
    filename: 'reddit-upvoter-log.txt',
    conflictAction: 'overwrite',
    saveAs: true,
  });
  URL.revokeObjectURL(url);
});

$('settingsLink').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

document.addEventListener('DOMContentLoaded', render);
