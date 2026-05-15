(async function(targetState) {
  const CLASS_NAME = "br-bold";

  const STOP_WORDS = new Set([
    // English
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with", "he", "as", "you", "do", "at", 
    "this", "but", "his", "by", "from", "they", "we", "say", "her", "she", "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
    // German
    "der", "die", "das", "und", "ist", "in", "zu", "den", "auf", "mit", "von", "sich", "als", "auch", "es", "ein", "dem", "aus", "des", "wie", "sie", "im"
  ]);

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

  // Typo1 algorithm from patent DE102017112916A1
  function getFixationLength(wordLength) {
    if (wordLength <= 3) return 1;
    if (wordLength === 4) return 2;
    // TYPO1: 3/5 of the start of each word
    return Math.ceil(wordLength * 0.6);
  }

  function highlightWord(word) {
    if (/\p{Extended_Pictographic}/u.test(word)) return word;
    if (/\d/.test(word)) return word; // As per patent: numbers are not highlighted

    // Separate punctuation from the core word using Unicode property escapes
    const match = word.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
    if (!match) return escapeHTML(word);

    const [_, leading, core, trailing] = match;
    if (!core || core.length < 2) return escapeHTML(word);

    if (core.includes("-")) {
      return leading + core.split("-").map(highlightWord).join("-") + trailing;
    }

    // --- Intelligent Mode: Bypass Stop Words ---
    if (STOP_WORDS.has(core.toLowerCase())) {
      return escapeHTML(word);
    }
    // -------------------------------------------

    const mid = getFixationLength(core.length);
    
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

  if (active === false) {
    document.body.classList.remove("bionic-is-active");
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
  } else if (active === true) {
    document.body.classList.add("bionic-is-active");
    walkAndProcess();
    observeChanges();
  }
})(typeof bionicTargetState !== 'undefined' ? bionicTargetState : undefined);
