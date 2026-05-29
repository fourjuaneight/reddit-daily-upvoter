import { FEED_TIMEOUT_MS } from './config';

function waitForSelector(selector: string, timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    const check = (): boolean => document.querySelectorAll(selector).length > 0;

    if (check()) {
      resolve(true);
      return;
    }

    const observer = new MutationObserver(() => {
      if (check()) {
        observer.disconnect();
        resolve(true);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(check());
    }, timeout);
  });
}

// Stage 1: wait for post shells — reliable early indicator of page load.
// Background tabs may throttle Lit's action bar rendering, so we separate
// the page-load check (shreddit-post) from the button-render check.
function waitForFeed(timeout = FEED_TIMEOUT_MS): Promise<boolean> {
  return waitForSelector('shreddit-post, .thing.link', timeout);
}

// Stage 2: after posts appear, give the action bar a chance to render.
// Resolving false is non-fatal — getFirstValidPost handles missing buttons.
function waitForActionBar(timeout = 8000): Promise<boolean> {
  return waitForSelector(UPVOTE_SEL + ', .thing.link .arrow.up', timeout);
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
// New Reddit: upvote buttons are searched document-wide (they are NOT
// always inside the <shreddit-post> element — Reddit renders them in
// adjacent divs via the parent Lit component). We use closest() to
// walk up to the associated shreddit-post for stickied detection.
//
// Legacy Reddit: buttons are inside .thing.link containers.
function getFirstValidPost(): PostInfo | null {
  // New Reddit — find upvote buttons directly in the document
  for (const btn of document.querySelectorAll<HTMLElement>(UPVOTE_SEL)) {
    const post = btn.closest<Element>('shreddit-post');
    if (post && isStickied(post)) continue;
    return {
      element: post ?? btn,
      title: post ? getPostTitle(post) : 'Unknown',
      upvoteButton: btn,
      isUpvoted: isAlreadyUpvoted(btn),
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
