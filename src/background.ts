import { Config, LogEntry, MessageType } from './types';
import { getConfig, addLogEntry, hasUpvotedToday } from './storage';

const ALARM_NAME = 'dailyUpvote';

async function registerAlarm(): Promise<void> {
  const config = await getConfig();
  await chrome.alarms.clear(ALARM_NAME);

  const now = new Date();
  const scheduled = new Date();
  scheduled.setHours(config.triggerHour, config.triggerMinute, 0, 0);

  // If today's time already passed, schedule for tomorrow
  if (scheduled <= now) {
    scheduled.setDate(scheduled.getDate() + 1);
  }

  await chrome.alarms.create(ALARM_NAME, {
    when: scheduled.getTime(),
    periodInMinutes: 1440, // repeat every 24h
  });
}

function buildUrl(subreddit: string, config: Config): string {
  return `https://www.reddit.com/r/${subreddit}/${config.sort}/?t=${config.sortTime}`;
}

async function openUpvoteTab(subreddit: string, isFallback: boolean): Promise<void> {
  // Don't re-upvote if already succeeded today (unless this is a fallback attempt)
  const alreadyDone = await hasUpvotedToday();
  if (alreadyDone && !isFallback) {
    console.log('[Reddit Upvoter] Already upvoted today, skipping.');
    return;
  }

  const config = await getConfig();
  const tab = await chrome.tabs.create({
    url: buildUrl(subreddit, config),
    active: false, // open in background
  });

  // Store task info so content.js messages route back here correctly
  if (tab.id) {
    await chrome.storage.session.set({
      activeTask: { tabId: tab.id, subreddit, isFallback },
    });
  }
}

async function handleMessage(
  message: MessageType,
  sender: chrome.runtime.MessageSender
): Promise<void> {
  const tabId = sender.tab?.id;
  const sessionData = await chrome.storage.session.get('activeTask');
  const task = sessionData.activeTask as
    | { tabId: number; subreddit: string; isFallback: boolean }
    | undefined;

  // Ignore messages from tabs we didn't open
  if (!task || (tabId && task.tabId !== tabId)) return;

  const config = await getConfig();
  const today = new Date().toISOString().split('T')[0];

  switch (message.type) {
    case 'UPVOTE_SUCCESS': {
      const entry: LogEntry = {
        date: today,
        timestamp: Date.now(),
        subreddit: message.subreddit,
        usedFallback: task.isFallback,
        fallbackReason: null,
        result: 'success',
        postTitle: message.postTitle,
        error: null,
      };
      await addLogEntry(entry);
      if (config.autoCloseTab && tabId) await chrome.tabs.remove(tabId);
      await chrome.storage.session.remove('activeTask');
      break;
    }

    case 'UPVOTE_ALREADY_DONE': {
      const entry: LogEntry = {
        date: today,
        timestamp: Date.now(),
        subreddit: message.subreddit,
        usedFallback: task.isFallback,
        fallbackReason: null,
        result: 'already_upvoted',
        postTitle: null,
        error: null,
      };
      await addLogEntry(entry);
      if (config.autoCloseTab && tabId) await chrome.tabs.remove(tabId);
      await chrome.storage.session.remove('activeTask');
      break;
    }

    case 'USE_FALLBACK': {
      if (tabId) await chrome.tabs.remove(tabId);

      if (!task.isFallback) {
        // Log primary failure before trying fallback
        await addLogEntry({
          date: today,
          timestamp: Date.now(),
          subreddit: task.subreddit,
          usedFallback: false,
          fallbackReason: message.reason,
          result: 'no_posts',
          postTitle: null,
          error: null,
        });
        await openUpvoteTab(config.fallbackSubreddit, true);
      } else {
        // Both primary and fallback failed
        const entry: LogEntry = {
          date: today,
          timestamp: Date.now(),
          subreddit: config.fallbackSubreddit,
          usedFallback: true,
          fallbackReason: message.reason,
          result: 'no_posts',
          postTitle: null,
          error: null,
        };
        await addLogEntry(entry);
        await chrome.storage.session.remove('activeTask');
      }
      break;
    }

    case 'UPVOTE_FAILED': {
      const entry: LogEntry = {
        date: today,
        timestamp: Date.now(),
        subreddit: task.subreddit,
        usedFallback: task.isFallback,
        fallbackReason: null,
        result: 'failed',
        postTitle: null,
        error: message.reason,
      };
      await addLogEntry(entry);
      if (config.autoCloseTab && tabId) await chrome.tabs.remove(tabId);
      await chrome.storage.session.remove('activeTask');
      break;
    }
  }
}

// MV3 service workers are ephemeral — re-register alarm on every startup
chrome.runtime.onInstalled.addListener(() => registerAlarm());
chrome.runtime.onStartup.addListener(() => registerAlarm());

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    const config = await getConfig();
    await openUpvoteTab(config.primarySubreddit, false);
  }
});

chrome.runtime.onMessage.addListener((message: MessageType, sender, sendResponse) => {
  if (message.type === 'TRIGGER_NOW') {
    getConfig().then((config) => openUpvoteTab(config.primarySubreddit, false));
    sendResponse({ ok: true });
    return;
  }
  handleMessage(message, sender);
});
