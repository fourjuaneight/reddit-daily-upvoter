import { getConfig, saveConfig } from './storage';
import { Config } from './types';

const SUBREDDIT_REGEX = /^[a-zA-Z0-9_]{3,21}$/;

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

function showStatus(msg: string, isError = false): void {
  const el = $('status');
  el.textContent = msg;
  el.className = isError ? 'error' : 'success';
  if (!isError) {
    setTimeout(() => {
      el.textContent = '';
    }, 3000);
  }
}

function stripPrefix(val: string): string {
  return val.replace(/^\/?(r\/)?/, '').trim();
}

async function loadSettings(): Promise<void> {
  const config = await getConfig();
  ($('primarySubreddit') as HTMLInputElement).value = config.primarySubreddit;
  ($('fallbackSubreddit') as HTMLInputElement).value = config.fallbackSubreddit;
  const hours = config.triggerHour.toString().padStart(2, '0');
  const mins = config.triggerMinute.toString().padStart(2, '0');
  ($('triggerTime') as HTMLInputElement).value = `${hours}:${mins}`;
  ($('autoCloseTab') as HTMLInputElement).checked = config.autoCloseTab;
}

function validate(): Config | null {
  const primary = stripPrefix(($('primarySubreddit') as HTMLInputElement).value);
  const fallback = stripPrefix(($('fallbackSubreddit') as HTMLInputElement).value);
  const time = ($('triggerTime') as HTMLInputElement).value;

  if (!SUBREDDIT_REGEX.test(primary)) {
    showStatus('Primary subreddit: 3-21 alphanumeric/underscore chars required.', true);
    return null;
  }
  if (!SUBREDDIT_REGEX.test(fallback)) {
    showStatus('Fallback subreddit: 3-21 alphanumeric/underscore chars required.', true);
    return null;
  }
  if (!time || !time.includes(':')) {
    showStatus('Valid time required.', true);
    return null;
  }

  const [h, m] = time.split(':').map(Number);

  return {
    primarySubreddit: primary,
    fallbackSubreddit: fallback,
    sort: 'top',
    sortTime: 'day',
    triggerHour: h,
    triggerMinute: m,
    autoCloseTab: ($('autoCloseTab') as HTMLInputElement).checked,
  };
}

$('saveBtn').addEventListener('click', async () => {
  const config = validate();
  if (!config) return;

  await saveConfig(config);

  // Re-register alarm with new time
  await chrome.alarms.clear('dailyUpvote');
  const now = new Date();
  const scheduled = new Date();
  scheduled.setHours(config.triggerHour, config.triggerMinute, 0, 0);
  if (scheduled <= now) {
    scheduled.setDate(scheduled.getDate() + 1);
  }
  await chrome.alarms.create('dailyUpvote', {
    when: scheduled.getTime(),
    periodInMinutes: 1440,
  });

  showStatus('Saved!');
});

document.addEventListener('DOMContentLoaded', loadSettings);
