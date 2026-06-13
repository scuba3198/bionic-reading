import { Effect, Match } from "effect";
import { StorageError, TabError } from "./services";

declare global {
  interface Window {
    bionicObserver?: MutationObserver | null;
    bionicTimeout?: any;
    bionicBuffer?: Set<Node>;
  }
}

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

const injectStyles = Effect.fn("injectStyles")(() =>
  Effect.sync(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${CLASS_NAME} { font-weight: 700 !important; display: inline; }
    `;
    document.head.appendChild(style);
  })
);

const processTextNodes = Effect.fn("processTextNodes")(function* (nodes: Node[]) {
  const validNodes: Node[] = [];
  const texts: string[] = [];

  if (hasMainContainer === null) {
    hasMainContainer = document.querySelector(MAIN_SELECTOR) !== null;
  }

  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || typeof parent.closest !== 'function') continue;
    
    if (parent.closest(EXCLUDED_SELECTOR)) continue;
    if (hasMainContainer && !parent.closest(MAIN_SELECTOR)) continue;
    
    const text = node.nodeValue;
    if (!text || text.length < 2 || !text.trim()) continue;

    validNodes.push(node);
    texts.push(text);
  }

  if (validNodes.length === 0) return;

  const response: { htmls?: string[]; error?: string } = yield* Effect.tryPromise({
    try: () => chrome.runtime.sendMessage({ type: "HIGHLIGHT_TEXTS", texts }),
    catch: (error) => new TabError({ message: `Failed to send highlight message to background: ${error}` }),
  });

  if (response.error) {
    return yield* Effect.fail(new TabError({ message: response.error }));
  }

  if (response.htmls) {
    for (let i = 0; i < validNodes.length; i++) {
      const node = validNodes[i];
      const html = response.htmls[i];
      
      const span = document.createElement("span");
      span.className = "bionic-processed";
      span.innerHTML = html;
      
      if (node.parentNode) {
        node.parentNode.replaceChild(span, node);
      }
    }
  }
});

const walkAndProcess = Effect.fn("walkAndProcess")(function* () {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  const nodes: Node[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node);
    node = walker.nextNode();
  }
  
  yield* processTextNodes(nodes);
});

const observeChanges = Effect.fn("observeChanges")(function* () {
  if (window.bionicObserver) return;

  window.bionicBuffer = new Set<Node>();
  window.bionicTimeout = null;

  const processBuffer = () => {
    if (window.bionicBuffer && window.bionicBuffer.size > 0) {
      const nodes = Array.from(window.bionicBuffer);
      window.bionicBuffer.clear();
      Effect.runFork(
        processTextNodes(nodes).pipe(
          Effect.catchAll((err) =>
            Match.value(err).pipe(
              Match.tag("TabError", (e) =>
                Effect.logError(`Buffer processing failed: ${e.message}`)
              ),
              Match.exhaustive
            )
          )
        )
      );
    }
    window.bionicTimeout = null;
  };

  window.bionicObserver = new MutationObserver((mutations) => {
    if (!window.bionicBuffer) return;

    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
          let textNode = walker.nextNode();
          while (textNode) {
            window.bionicBuffer!.add(textNode);
            textNode = walker.nextNode();
          }
        } else if (node.nodeType === Node.TEXT_NODE) {
          window.bionicBuffer!.add(node);
        }
      });
    });

    if (window.bionicBuffer.size > 0) {
      if (window.bionicTimeout) clearTimeout(window.bionicTimeout);
      window.bionicTimeout = setTimeout(processBuffer, 100);
    }
  });

  window.bionicObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
});

const runBionicConversion = Effect.fn("runBionicConversion")(function* () {
  const response = yield* Effect.tryPromise({
    try: () => chrome.storage.local.get("bionic_active"),
    catch: (error) => new StorageError({ message: `Storage read failed: ${error}` }),
  });
  const bionicActive = !!response.bionic_active;

  yield* injectStyles();
  
  const style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (style) {
    style.disabled = !bionicActive;
  }

  if (bionicActive) {
    yield* walkAndProcess();
    yield* observeChanges();
  } else {
    if (window.bionicObserver) {
      window.bionicObserver.disconnect();
      window.bionicObserver = null;
    }
    if (window.bionicTimeout) {
      clearTimeout(window.bionicTimeout);
      window.bionicTimeout = null;
    }
    if (window.bionicBuffer) {
      window.bionicBuffer.clear();
    }
  }
  
  document.body.classList.add("bionic-reading-processed");
});

Effect.runFork(
  runBionicConversion().pipe(
    Effect.catchAll((err) =>
      Match.value(err).pipe(
        Match.tag("StorageError", (e) =>
          Effect.logError(`Bionic reading engine storage failed: ${e.message}`)
        ),
        Match.tag("TabError", (e) =>
          Effect.logError(`Bionic reading engine tab message failed: ${e.message}`)
        ),
        Match.exhaustive
      )
    )
  )
);
