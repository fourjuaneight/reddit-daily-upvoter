import { FEED_TIMEOUT_MS } from './config';

// Waits for Reddit's JS-rendered feed to populate the DOM.
// Returns false if nothing appears within the timeout.
function waitForFeed(timeout = FEED_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const check = (): boolean => {
      return (
        document.querySelectorAll('shreddit-post').length > 0 ||
        document.querySelectorAll('.thing.link').length > 0
      );
    };

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

// Finds upvote button using multiple strategies to handle Reddit's
// obfuscated class names and shadow DOM web components.
function findUpvoteButton(post: Element): HTMLElement | null {
  // Strategy 1: aria-label (most reliable on new Reddit)
  const ariaBtn = post.querySelector<HTMLElement>(
    'button[aria-label*="upvote" i], button[aria-label*="Upvote" i]'
  );
  if (ariaBtn) return ariaBtn;

  // Strategy 2: shadow DOM inside shreddit-post
  const shadowHost = post.shadowRoot ? post : post.querySelector('shreddit-post');
  if (shadowHost?.shadowRoot) {
    const shadowBtn = shadowHost.shadowRoot.querySelector<HTMLElement>(
      'button[aria-label*="upvote" i]'
    );
    if (shadowBtn) return shadowBtn;
  }

  // Strategy 3: faceplate-button custom elements
  for (const fb of post.querySelectorAll('faceplate-button')) {
    const btn = fb.querySelector<HTMLElement>('button[aria-label*="upvote" i]');
    if (btn) return btn;
    if (fb.shadowRoot) {
      const shadowBtn = fb.shadowRoot.querySelector<HTMLElement>('button[aria-label*="upvote" i]');
      if (shadowBtn) return shadowBtn;
    }
  }

  // Strategy 4: legacy Reddit (.arrow.up class)
  return post.querySelector<HTMLElement>('.arrow.up');
}

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

// Finds first non-stickied post across both Reddit layouts
function getFirstValidPost(): PostInfo | null {
  // New Reddit web components
  for (const post of document.querySelectorAll('shreddit-post')) {
    if (isStickied(post)) continue;
    const upvoteButton = findUpvoteButton(post);
    return {
      element: post,
      title: getPostTitle(post),
      upvoteButton,
      isUpvoted: upvoteButton ? isAlreadyUpvoted(upvoteButton) : false,
    };
  }

  // Legacy Reddit
  for (const post of document.querySelectorAll('.thing.link')) {
    if (isStickied(post)) continue;
    const upvoteButton = findUpvoteButton(post);
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
