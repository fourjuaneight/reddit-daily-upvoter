import { FEED_TIMEOUT_MS } from './config';

// Reaches closed shadow roots that element.shadowRoot returns null for.
function getShadowRoot(el: Element): ShadowRoot | null {
  return el.shadowRoot ?? chrome.dom.openOrClosedShadowRoot(el as HTMLElement);
}

// Stage 1: wait for shreddit-post shells in the light DOM (page load signal).
// MutationObserver on document.body is sufficient since shreddit-post elements
// are in the light DOM (slotted content).
function waitForFeed(timeout = FEED_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const check = (): boolean =>
      document.querySelectorAll('shreddit-post, .thing.link').length > 0;

    if (check()) { resolve(true); return; }

    const observer = new MutationObserver(() => {
      if (check()) { observer.disconnect(); resolve(true); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(check()); }, timeout);
  });
}

// Returns true if any shreddit-post shadow root contains upvote buttons.
// The upvote button lives inside shreddit-post's shadow DOM:
//   shreddit-post → #shadow-root → rpl-action-bar → … → button[data-action-bar-action="upvote"]
function upvoteButtonsReady(): boolean {
  for (const post of document.querySelectorAll('shreddit-post')) {
    const shadow = getShadowRoot(post);
    if (shadow && shadow.querySelectorAll(UPVOTE_SEL).length > 0) return true;
  }
  return document.querySelectorAll('.thing.link .arrow.up').length > 0;
}

// Stage 2: poll shreddit-post shadow roots for upvote buttons.
// MutationObserver on document.body won't fire for mutations inside shadow DOM,
// so polling is used. Chrome throttles setTimeout in background tabs to ~1s.
function waitForActionBar(timeout = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const end = Date.now() + timeout;

    const poll = () => {
      if (upvoteButtonsReady()) { resolve(true); return; }
      if (Date.now() < end) { setTimeout(poll, 250); } else { resolve(false); }
    };
    poll();
  });
}

function isLoginPage(): boolean {
  return window.location.href.includes('/login') || window.location.href.includes('/account/login');
}

function isErrorPage(): boolean {
  const body = document.body.innerText.toLowerCase();
  return (
    body.includes('this community is private') ||
    body.includes('this community has been banned') ||
    body.includes('page not found') ||
    document.title.toLowerCase().includes('page not found')
  );
}

interface PostInfo {
  element: Element;
  title: string;
  upvoteButton: HTMLElement | null;
  isUpvoted: boolean;
}

function isStickied(post: Element): boolean {
  if (post.hasAttribute('stickied')) return true;
  if (post.getAttribute('data-promoted') === 'true') return true;

  // New Reddit shows "Pinned" in the credit bar slot
  const slot = post.querySelector('[slot="credit-bar"]');
  if (slot?.textContent?.toLowerCase().includes('pinned')) return true;

  // Legacy Reddit
  if (post.classList.contains('stickied')) return true;

  return false;
}

// Upvote buttons on new Reddit are NOT always inside <shreddit-post> —
// they may be rendered in adjacent divs by the parent Lit component.
// Primary selectors target Reddit's stable data attributes rather than
// aria-label, which is absent on the current shreddit layout.
const UPVOTE_SEL = 'button[data-action-bar-action="upvote"], button[upvote]';

function isAlreadyUpvoted(button: HTMLElement): boolean {
  if (button.getAttribute('aria-pressed') === 'true') return true;
  if (button.getAttribute('aria-label')?.toLowerCase().includes('unvote')) return true;
  // Legacy Reddit marks upvoted with .upmod class
  if (button.classList.contains('upmod')) return true;
  return false;
}

function getPostTitle(post: Element): string {
  const el =
    post.querySelector<HTMLElement>('[slot="title"]') ??
    post.querySelector<HTMLElement>('a.title') ??
    post.querySelector<HTMLElement>('h3');
  return el?.textContent?.trim() ?? 'Unknown';
}

// Finds first non-stickied post across both Reddit layouts.
//
// New Reddit: the upvote button is inside shreddit-post's shadow DOM:
//   shreddit-post → #shadow-root → rpl-action-bar → … → button[data-action-bar-action="upvote"]
// shreddit-post elements are in the light DOM; their shadow roots are not.
//
// Legacy Reddit: buttons are inside .thing.link containers.
function getFirstValidPost(): PostInfo | null {
  // New Reddit — iterate shreddit-post light DOM elements, search shadow root
  for (const post of document.querySelectorAll('shreddit-post')) {
    if (isStickied(post)) continue;
    const shadow = getShadowRoot(post);
    const upvoteButton = shadow?.querySelector<HTMLElement>(UPVOTE_SEL) ?? null;
    return {
      element: post,
      title: getPostTitle(post),
      upvoteButton,
      isUpvoted: upvoteButton ? isAlreadyUpvoted(upvoteButton) : false,
    };
  }

  // Legacy Reddit — buttons live inside .thing.link
  for (const post of document.querySelectorAll('.thing.link')) {
    if (isStickied(post)) continue;
    const upvoteButton = post.querySelector<HTMLElement>('.arrow.up');
    return {
      element: post,
      title: getPostTitle(post),
      upvoteButton,
      isUpvoted: upvoteButton ? isAlreadyUpvoted(upvoteButton) : false,
    };
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(): Promise<void> {
  try {
    if (isLoginPage()) {
      chrome.runtime.sendMessage({ type: 'UPVOTE_FAILED', reason: 'not_logged_in' });
      return;
    }

    if (isErrorPage()) {
      chrome.runtime.sendMessage({ type: 'USE_FALLBACK', reason: 'subreddit_unavailable' });
      return;
    }

    const feedLoaded = await waitForFeed();
    if (!feedLoaded) {
      chrome.runtime.sendMessage({ type: 'USE_FALLBACK', reason: 'page_load_timeout' });
      return;
    }

    await waitForActionBar();

    const post = getFirstValidPost();
    if (!post) {
      chrome.runtime.sendMessage({ type: 'USE_FALLBACK', reason: 'no_posts' });
      return;
    }

    if (!post.upvoteButton) {
      chrome.runtime.sendMessage({ type: 'UPVOTE_FAILED', reason: 'button_not_found' });
      return;
    }

    const subreddit = window.location.pathname.split('/')[2] ?? 'unknown';

    if (post.isUpvoted) {
      chrome.runtime.sendMessage({ type: 'UPVOTE_ALREADY_DONE', subreddit });
      return;
    }

    // Click and verify — retry once if state doesn't change
    post.upvoteButton.click();
    await sleep(1000);

    if (isAlreadyUpvoted(post.upvoteButton)) {
      chrome.runtime.sendMessage({ type: 'UPVOTE_SUCCESS', subreddit, postTitle: post.title });
      return;
    }

    await sleep(2000);
    post.upvoteButton.click();
    await sleep(1000);

    if (isAlreadyUpvoted(post.upvoteButton)) {
      chrome.runtime.sendMessage({ type: 'UPVOTE_SUCCESS', subreddit, postTitle: post.title });
    } else {
      chrome.runtime.sendMessage({ type: 'UPVOTE_FAILED', reason: 'upvote_state_unchanged' });
    }
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'UPVOTE_FAILED',
      reason: err instanceof Error ? err.message : 'unknown_error',
    });
  }
}

run();
