# Bionic Reading Intelligent Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the "intelligent mode" dynamic stop-word filter to avoid highlighting high-frequency words.

**Architecture:** We will embed an `O(1)` JS `Set` at the top of the content script containing common stop words. `highlightWord` will evaluate the core word against this `Set` before applying the TYPO1 algorithm.

**Tech Stack:** Vanilla JavaScript, DOM API, Chrome Extension APIs.

---

### Task 1: Update `convert.js` with Stop-Words Filter

**Files:**
- Modify: `c:\Users\Mumukshu\Projects\Bionic Reading\src\convert.js`

- [ ] **Step 1: Write the minimal implementation**

Modify `src/convert.js` to define the `STOP_WORDS` set and implement the logic inside `highlightWord`.

```javascript
// At the top of the file, right after `const STYLE_ID = "bionic-reading-styles";`
  const STOP_WORDS = new Set([
    // English
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with", "he", "as", "you", "do", "at", 
    "this", "but", "his", "by", "from", "they", "we", "say", "her", "she", "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
    // German
    "der", "die", "das", "und", "ist", "in", "zu", "den", "auf", "mit", "von", "sich", "als", "auch", "es", "ein", "dem", "aus", "des", "wie", "sie", "im"
  ]);
```

Then update the `highlightWord` function:

```javascript
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

    // --- NEW LOGIC: Check for stop words ---
    if (STOP_WORDS.has(core.toLowerCase())) {
      return escapeHTML(word);
    }
    // ---------------------------------------

    const mid = getFixationLength(core.length);
    
    return escapeHTML(leading) + 
           `<span class="${CLASS_NAME}">${escapeHTML(core.slice(0, mid))}</span>` + 
           escapeHTML(core.slice(mid)) + 
           escapeHTML(trailing);
  }
```

- [ ] **Step 2: Verify in Browser (Manual Test)**

Run the following test logic manually since there is no automated test runner. Open a Chrome tab to any long text article (like a Wikipedia page), reload the unpacked extension, and press `Alt+B`. Verify that small words like "the", "and", "of", "die", "das" are NOT bolded, while longer words still get their `3/5` prefix bolded.

- [ ] **Step 3: Commit**

```bash
git add src/convert.js
git commit -m "feat: implement intelligent mode stop-word filter"
```
