export {};

declare global {
  interface Window {
    bionicObserver?: MutationObserver | null;
    bionicTimeout?: number | null;
    bionicBuffer?: Set<Node>;
    bionicRunId?: number;
    bionicWrappers?: Set<HTMLElement>;
    bionicStyle?: HTMLStyleElement | null;
    bionicBodyClassAdded?: boolean;
  }
}

const CLASS_NAME = "br-bold";
const STYLE_ID = "bionic-reading-styles";

const EXCLUDED_SELECTOR = [
  `.${CLASS_NAME}`,
  ".bionic-processed",
  "script",
  "style",
  "noscript",
  "textarea",
  "input",
  "select",
  "button",
  "nav",
  "aside",
  "footer",
  "header",
  '[role="navigation"]',
  '[role="complementary"]',
  '[role="contentinfo"]',
  '[role="banner"]',
  '[role="search"]',
  ".nav",
  ".navbar",
  ".sidebar",
  ".footer",
  ".header",
  ".menu",
  ".navigation",
  ".ad",
  ".ads",
  ".ad-container",
  ".advertisement",
  ".social-share",
  ".share-buttons",
  ".comments",
  "#comments",
  ".cookie-banner",
  ".cookie-notice",
  ".consent-banner",
  "#cookie-consent",
].join(", ");

const MAIN_SELECTOR = "main, [role=\"main\"], .main-content, #main-content, #content, .entry-content, .post-content";
let hasMainContainer: boolean | null = null;

// Keep the formatter boundary narrow: only plain text and our own bold span are copied into the page.
const safeHtmlToNodes = (html: string, doc: Document): Node[] => {
  const parsedDoc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const container = parsedDoc.body.firstElementChild;
  if (!container) return [];

  return Array.from(container.childNodes, (child) => {
    if (child.nodeType === Node.TEXT_NODE) return doc.createTextNode(child.textContent || "");
    if (
      child.nodeType === Node.ELEMENT_NODE &&
      child.nodeName.toLowerCase() === "span" &&
      (child as Element).className === CLASS_NAME
    ) {
      const span = doc.createElement("span");
      span.className = CLASS_NAME;
      span.textContent = child.textContent || "";
      return span;
    }
    return doc.createTextNode(child.textContent || "");
  });
};

const injectStyles = () => {
  if (window.bionicStyle?.isConnected || !document.head) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `.${CLASS_NAME} { font-weight: 700 !important; display: inline; }`;
  document.head.appendChild(style);
  window.bionicStyle = style;
};

const pruneDisconnectedWrappers = () => {
  const wrappers = window.bionicWrappers;
  if (!wrappers) return;
  wrappers.forEach((wrapper) => {
    if (!wrapper.isConnected) {
      const text = document.createTextNode(wrapper.textContent || "");
      if (wrapper.parentNode) wrapper.replaceWith(text);
      else {
        wrapper.classList.remove("bionic-processed");
        wrapper.replaceChildren(text);
      }
      wrappers.delete(wrapper);
    }
  });
};

const processTextNodes = async (nodes: Node[], runId = window.bionicRunId) => {
  const validNodes: Node[] = [];
  const texts: string[] = [];

  if (hasMainContainer === null) hasMainContainer = document.querySelector(MAIN_SELECTOR) !== null;

  for (const node of nodes) {
    const parent = node.parentElement;
    if (!node.isConnected || !parent || parent.closest(EXCLUDED_SELECTOR)) continue;
    if (hasMainContainer && !parent.closest(MAIN_SELECTOR)) continue;

    const text = node.nodeValue;
    if (!text || text.length < 2 || !text.trim()) continue;
    validNodes.push(node);
    texts.push(text);
  }

  if (!validNodes.length) return;

  const response: { htmls?: string[]; error?: string } = await chrome.runtime.sendMessage({
    type: "HIGHLIGHT_TEXTS",
    texts,
  });
  if (response?.error) throw new Error(response.error);
  if (!response?.htmls || runId !== window.bionicRunId) return;

  pruneDisconnectedWrappers();
  const wrappers = window.bionicWrappers || (window.bionicWrappers = new Set<HTMLElement>());
  let index = 0;
  await new Promise<void>((resolve) => {
    const processChunk = () => {
      if (runId !== window.bionicRunId) {
        resolve();
        return;
      }

      pruneDisconnectedWrappers();
      const end = Math.min(index + 50, validNodes.length);
      for (; index < end; index++) {
        if (runId !== window.bionicRunId) break;
        const node = validNodes[index];
        const html = response.htmls?.[index];
        if (
          typeof html !== "string" ||
          !node?.isConnected ||
          !node.parentElement ||
          node.parentElement.closest(EXCLUDED_SELECTOR)
        ) {
          continue;
        }

        const span = document.createElement("span");
        span.className = "bionic-processed";
        safeHtmlToNodes(html, document).forEach((parsedNode) => span.appendChild(parsedNode));
        node.parentNode?.replaceChild(span, node);
        if (span.isConnected) wrappers.add(span);
      }

      if (index < validNodes.length && runId === window.bionicRunId) {
        requestAnimationFrame(processChunk);
      } else {
        resolve();
      }
    };

    requestAnimationFrame(processChunk);
  });
};

const walkAndProcess = async (runId: number) => {
  if (!document.body) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Node[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node);
    node = walker.nextNode();
  }
  await processTextNodes(nodes, runId);
};

const observeChanges = (runId: number) => {
  if (window.bionicObserver || !document.body) return;

  window.bionicBuffer = new Set<Node>();
  window.bionicTimeout = null;

  const processBuffer = async () => {
    const buffer = window.bionicBuffer;
    if (!buffer?.size) return;
    const nodes = Array.from(buffer);
    buffer.clear();
    try {
      await processTextNodes(nodes, runId);
    } catch (error) {
      console.error("Bionic buffer processing failed:", error);
    }
  };

  window.bionicObserver = new MutationObserver((mutations) => {
    pruneDisconnectedWrappers();
    const buffer = window.bionicBuffer;
    if (!buffer) return;

    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          let textNode = walker.nextNode();
          while (textNode) {
            buffer.add(textNode);
            textNode = walker.nextNode();
          }
        } else if (node.nodeType === Node.TEXT_NODE) {
          buffer.add(node);
        }
      });
    });

    if (buffer.size) {
      if (window.bionicTimeout !== null && window.bionicTimeout !== undefined) {
        clearTimeout(window.bionicTimeout);
      }
      window.bionicTimeout = window.setTimeout(() => {
        window.bionicTimeout = null;
        void processBuffer();
      }, 100);
    }
  });

  window.bionicObserver.observe(document.body, { childList: true, subtree: true });
};

const restoreOriginalDom = () => {
  window.bionicObserver?.disconnect();
  window.bionicObserver = null;
  if (window.bionicTimeout !== null && window.bionicTimeout !== undefined) {
    clearTimeout(window.bionicTimeout);
  }
  window.bionicTimeout = null;
  window.bionicBuffer?.clear();

  window.bionicWrappers?.forEach((wrapper) => {
    if (wrapper.isConnected) wrapper.replaceWith(document.createTextNode(wrapper.textContent || ""));
  });
  window.bionicWrappers?.clear();

  if (window.bionicStyle?.isConnected) window.bionicStyle.remove();
  window.bionicStyle = null;
  if (window.bionicBodyClassAdded) document.body?.classList.remove("bionic-reading-processed");
  window.bionicBodyClassAdded = false;
};

const runBionicConversion = async () => {
  const runId = (window.bionicRunId || 0) + 1;
  window.bionicRunId = runId;
  const response: { bionicActive?: boolean; error?: string } = await chrome.runtime.sendMessage({
    type: "GET_ACTIVE_STATUS",
  });
  if (response?.error) throw new Error(response.error);
  if (runId !== window.bionicRunId) return;

  restoreOriginalDom();
  if (!response?.bionicActive) return;

  injectStyles();
  await walkAndProcess(runId);
  if (runId !== window.bionicRunId) return;
  observeChanges(runId);
  if (document.body && !document.body.classList.contains("bionic-reading-processed")) {
    document.body.classList.add("bionic-reading-processed");
    window.bionicBodyClassAdded = true;
  }
};

void runBionicConversion().catch((error) => console.error("Bionic reading conversion failed:", error));
