# Bionic Reading Intelligent Mode (Patent Alignment) Design

## Purpose
The Bionic Reading extension currently highlights a portion of every single word. To strictly align with the patent's recommendations for an advanced configuration (DE102017112916A1), the extension needs an "intelligent mode" that avoids highlighting words with a high repetition rate (stop words) to reduce visual clutter and eye strain.

## Architecture

### 1. Stop-Word Dictionary
- A comprehensive `Set` of stop words will be added to `convert.js`.
- Using a `Set` ensures `O(1)` lookup time, preventing performance bottlenecks during DOM traversal.
- The dictionary will include high-frequency English and German words (e.g., "the", "and", "is", "a", "der", "die", "und").
- The list will be thorough (no lazy shortcuts), covering the most common filler words that do not require fixation points.

### 2. Processing Logic Update in `highlightWord`
- **Punctuation Stripping**: Extract the core word using the existing Unicode-aware regex.
- **Normalization**: Convert the core word to lowercase for consistent dictionary matching.
- **Evaluation**: 
  - If `STOP_WORDS.has(coreWord.toLowerCase())` is true, return the word immediately with proper HTML escaping but NO bionic highlighting.
  - If false, proceed with the TYPO1 algorithm (highlighting `3/5` of the word).
- **Hyphenated Words**: The logic will evaluate each component of a hyphenated word independently. If a sub-word is a stop word, it skips highlighting while the rest of the hyphenated structure is processed normally.

## Data Flow
1. MutationObserver/TreeWalker extracts a text node.
2. Text node is split into words.
3. Each word is evaluated by `highlightWord`.
4. High-frequency words are bypassed (escaped only).
5. Meaningful words receive TYPO1 fixation points.
6. Reassembled HTML replaces the original text node.

## Error Handling & Edge Cases
- **Numbers/Pictographs**: Already handled; will continue to be bypassed.
- **Case Insensitivity**: Addressed via `.toLowerCase()` before checking the Set.
- **HTML Injection/XSS**: The existing `escapeHTML` function will wrap all bypassed stop words, ensuring strict security is maintained.
