(async function(targetState) {
  const CLASS_NAME = "br-bold";
  const STYLE_ID = "bionic-reading-styles";

  function injectStyles() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .${CLASS_NAME} { font-weight: 700 !important; display: inline; }
      `;
      document.head.appendChild(style);
    }
    return style;
  }

  function escapeHTML(str) {
    return str.replace(/[&<>"']/g, function(m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[m];
    });
  }

  function highlightWord(word) {
    if (/\p{Extended_Pictographic}/u.test(word)) return word;
    if (/\d/.test(word)) return word;

    // Separate punctuation from the core word
    const match = word.match(/^([^a-zA-Z0-9]*)(.*?)([^a-zA-Z0-9]*)$/);
    if (!match) return escapeHTML(word);

    const [_, leading, core, trailing] = match;
    if (!core || core.length < 2) return escapeHTML(word);

    if (core.includes("-")) {
      return leading + core.split("-").map(highlightWord).join("-") + trailing;
    }

    const mid = core.length <= 3 ? 1 : Math.floor(core.length / 2);
    
    return escapeHTML(leading) + 
           `<span class="${CLASS_NAME}">${escapeHTML(core.slice(0, mid))}</span>` + 
           escapeHTML(core.slice(mid)) + 
           escapeHTML(trailing);
  }

  function processTextNode(node) {
    try {
      if (!node.parentElement || typeof node.parentElement.closest !== 'function') return;
      if (node.parentElement.closest(`.${CLASS_NAME}, .bionic-processed, script, style, noscript, textarea, input`)) return;
      
      const text = node.nodeValue;
      if (!text || text.length < 2 || !text.trim()) return;

      const words = text.split(/(\s+)/);
      const transformed = words.map(w => {
        if (!w.trim()) return escapeHTML(w); // Keep spaces safe
        return highlightWord(w);
      }).join("");
      
      const span = document.createElement("span");
      span.className = "bionic-processed";
      span.innerHTML = transformed;
      node.replaceWith(span);
    } catch (e) {
      // Silently skip nodes that cause DOM errors during processing
    }
  }

  function walkAndProcess() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    const nodes = [];
    while (node = walker.nextNode()) nodes.push(node);
    nodes.forEach(processTextNode);
  }

  function observeChanges() {
    if (window.bionicObserver) return;
    
    window.bionicBuffer = new Set();
    window.bionicTimeout = null;

    const processBuffer = () => {
      window.bionicBuffer.forEach(node => processTextNode(node));
      window.bionicBuffer.clear();
      window.bionicTimeout = null;
    };

    window.bionicObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
            let textNode;
            while (textNode = walker.nextNode()) window.bionicBuffer.add(textNode);
          } else if (node.nodeType === Node.TEXT_NODE) {
            window.bionicBuffer.add(node);
          }
        });
      });

      if (window.bionicBuffer.size > 0) {
        if (window.bionicTimeout) clearTimeout(window.bionicTimeout);
        window.bionicTimeout = setTimeout(processBuffer, 100);
      }
    });

    window.bionicObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Self-Initialization Logic
  let active = targetState;
  
  if (active === undefined && chrome.runtime?.id) {
    try {
      const { tabId } = await chrome.runtime.sendMessage({ action: "getTabId" });
      if (tabId) {
        const key = `bionic_active_${tabId}`;
        const data = await chrome.storage.local.get(key);
        active = !!data[key];
      }
    } catch (e) { /* Extension context invalidated or not yet ready */ }
  }

  const style = injectStyles();
  if (active === false) {
    style.disabled = true;
  } else if (active === true) {
    style.disabled = false;
    if (!document.body.classList.contains("bionic-reading-processed")) {
      walkAndProcess();
      observeChanges();
      document.body.classList.add("bionic-reading-processed");
    }
  }
})(typeof bionicTargetState !== 'undefined' ? bionicTargetState : undefined);
