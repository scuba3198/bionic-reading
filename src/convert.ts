import { Effect } from "effect";

const CLASS_NAME = "br-bold";
const STYLE_ID = "bionic-reading-styles";

const EXCLUDED_SELECTOR = [
  `.${CLASS_NAME}`,
  '.bionic-processed',
  'script',
  'style',
  'noscript',
  'textarea',
  'input',
  'select',
  'button',
  'nav',
  'aside',
  'footer',
  'header',
  '[role="navigation"]',
  '[role="complementary"]',
  '[role="contentinfo"]',
  '[role="banner"]',
  '[role="search"]',
  '.nav',
  '.navbar',
  '.sidebar',
  '.footer',
  '.header',
  '.menu',
  '.navigation',
  '.ad',
  '.ads',
  '.ad-container',
  '.advertisement',
  '.social-share',
  '.share-buttons',
  '.comments',
  '#comments',
  '.cookie-banner',
  '.cookie-notice',
  '.consent-banner',
  '#cookie-consent'
].join(', ');

const MAIN_SELECTOR = 'main, article, [role="main"], .main-content, #main-content, #content';

let hasMainContainer: boolean | null = null;

const injectStyles = Effect.sync(() => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${CLASS_NAME} { font-weight: 700 !important; display: inline; }
  `;
  document.head.appendChild(style);
});

const processTextNodes = (nodes: Node[]) =>
  Effect.gen(function* () {
    const validNodes: Node[] = [];
    const texts: string[] = [];

    if (hasMainContainer === null) {
      hasMainContainer = document.querySelector(MAIN_SELECTOR) !== null;
    }

    for (const node of nodes) {
      const parent = node.parentElement;
      if (!parent || typeof parent.closest !== 'function') continue;
      
      // Exclude layout elements and navigation/advertisement/cookie noise
      if (parent.closest(EXCLUDED_SELECTOR)) continue;
      
      // If the page has a main content/article container, ignore text nodes outside of it
      if (hasMainContainer && !parent.closest(MAIN_SELECTOR)) continue;
      
      const text = node.nodeValue;
      if (!text || text.length < 2 || !text.trim()) continue;

      validNodes.push(node);
      texts.push(text);
    }

    if (validNodes.length === 0) return;

    const response: { htmls?: string[]; error?: string } = yield* Effect.tryPromise({
      try: () => chrome.runtime.sendMessage({ type: "HIGHLIGHT_TEXTS", texts }),
      catch: (error) => new Error(`Failed to send highlight message to background: ${error}`),
    });

    if (response.error) {
      yield* Effect.fail(new Error(response.error));
    }

    if (response.htmls) {
      for (let i = 0; i < validNodes.length; i++) {
        const node = validNodes[i];
        const html = response.htmls[i];
        
        const span = document.createElement("span");
        span.className = "bionic-processed";
        span.innerHTML = html;
        
        node.replaceWith(span);
      }
    }
  });

const walkAndProcess = Effect.gen(function* () {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  const nodes: Node[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node);
    node = walker.nextNode();
  }
  
  yield* processTextNodes(nodes);
});

const observeChanges = Effect.sync(() => {
  const observer = new MutationObserver((mutations) => {
    const newNodes: Node[] = [];
    
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
          let textNode = walker.nextNode();
          while (textNode) {
            newNodes.push(textNode);
            textNode = walker.nextNode();
          }
        } else if (node.nodeType === Node.TEXT_NODE) {
          newNodes.push(node);
        }
      });
    });

    if (newNodes.length > 0) {
      Effect.runFork(
        processTextNodes(newNodes).pipe(
          Effect.catchAll((err) => Effect.logError("Mutation processing failed", err))
        )
      );
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
});

const runBionicConversion = Effect.gen(function* () {
  const response = yield* Effect.tryPromise({
    try: () => chrome.storage.local.get("bionic_active"),
    catch: (error) => new Error(`Storage read failed: ${error}`),
  });
  const bionicActive = !!response.bionic_active;

  if (document.body.classList.contains("bionic-reading-processed")) {
    const style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (style) {
      style.disabled = !bionicActive;
    }
    return;
  }

  yield* injectStyles;
  
  const style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (style) {
    style.disabled = !bionicActive;
  }

  yield* walkAndProcess;
  yield* observeChanges;
  
  document.body.classList.add("bionic-reading-processed");
});

Effect.runFork(
  runBionicConversion.pipe(
    Effect.catchAll((err) => Effect.logError("Bionic reading engine failed", err))
  )
);
