use wasm_bindgen::prelude::*;

const STOP_WORDS: &[&str] = &[
    // English
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with", "he", "as", "you", "do", "at", 
    "this", "but", "his", "by", "from", "they", "we", "say", "her", "she", "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
    // German
    "der", "die", "das", "und", "ist", "in", "zu", "den", "auf", "mit", "von", "sich", "als", "auch", "es", "ein", "dem", "aus", "des", "wie", "sie", "im"
];

fn escape_html(s: &str) -> String {
    let mut escaped = String::with_capacity(s.len() * 2);
    for c in s.chars() {
        match c {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(c),
        }
    }
    escaped
}

fn is_emoji(c: char) -> bool {
    let val = c as u32;
    (0x1F300..=0x1F9FF).contains(&val) || 
    (0x1F600..=0x1F64F).contains(&val) || 
    (0x1F680..=0x1F6FF).contains(&val) || 
    (0x2600..=0x27BF).contains(&val)
}

// Typo1 algorithm from patent DE102017112916A1
fn get_fixation_length(len: usize) -> usize {
    if len <= 3 {
        1
    } else if len == 4 {
        2
    } else {
        // TYPO1: 3/5 of the start of each word
        ((len as f64) * 0.6).ceil() as usize
    }
}

#[wasm_bindgen]
pub fn highlight_word(word: &str) -> String {
    if word.is_empty() {
        return String::new();
    }

    // Skip if word contains pictographic/emoji
    if word.chars().any(is_emoji) {
        return escape_html(word);
    }

    // Skip if word contains digits
    if word.chars().any(|c| c.is_ascii_digit()) {
        return escape_html(word);
    }

    // Separate leading/trailing punctuation using alphanumeric checks (equivalent to unicode \p{L}\p{N})
    let chars: Vec<char> = word.chars().collect();
    let mut start = 0;
    let mut end = chars.len();

    while start < end && !chars[start].is_alphanumeric() {
        start += 1;
    }
    while end > start && !chars[end - 1].is_alphanumeric() {
        end -= 1;
    }

    let leading: String = chars[0..start].iter().collect();
    let core: String = chars[start..end].iter().collect();
    let trailing: String = chars[end..].iter().collect();

    if core.is_empty() {
        return escape_html(word);
    }

    if core.len() < 2 {
        return escape_html(&leading) + &escape_html(&core) + &escape_html(&trailing);
    }

    if core.contains('-') {
        let parts: Vec<String> = core
            .split('-')
            .map(highlight_word)
            .collect();
        return escape_html(&leading) + &parts.join("-") + &escape_html(&trailing);
    }

    // Intelligent Mode: Bypass Stop Words (case insensitive)
    if STOP_WORDS.contains(&core.to_lowercase().as_str()) {
        return escape_html(&leading) + &escape_html(&core) + &escape_html(&trailing);
    }

    let core_chars: Vec<char> = core.chars().collect();
    let mid = get_fixation_length(core_chars.len());

    let first: String = core_chars[0..mid].iter().collect();
    let second: String = core_chars[mid..].iter().collect();

    escape_html(&leading)
        + "<span class=\"br-bold\">"
        + &escape_html(&first)
        + "</span>"
        + &escape_html(&second)
        + &escape_html(&trailing)
}

#[wasm_bindgen]
pub fn transform_text(text: &str) -> String {
    let mut result = String::with_capacity(text.len() * 2);
    let mut current_token = String::new();
    let mut in_whitespace = false;

    for c in text.chars() {
        if c.is_whitespace() {
            if !in_whitespace {
                if !current_token.is_empty() {
                    result.push_str(&highlight_word(&current_token));
                    current_token.clear();
                }
                in_whitespace = true;
            }
            current_token.push(c);
        } else {
            if in_whitespace {
                result.push_str(&current_token);
                current_token.clear();
                in_whitespace = false;
            }
            current_token.push(c);
        }
    }

    if !current_token.is_empty() {
        if in_whitespace {
            result.push_str(&current_token);
        } else {
            result.push_str(&highlight_word(&current_token));
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_highlight_word() {
        // Patent rules (Typo1)
        // len <= 3 -> 1
        assert_eq!(highlight_word("the"), "the"); // Stop word bypasses highlight!
        assert_eq!(highlight_word("and"), "and"); // Stop word bypasses highlight!
        assert_eq!(highlight_word("cat"), "<span class=\"br-bold\">c</span>at");
        // len = 4 -> 2
        assert_eq!(highlight_word("test"), "<span class=\"br-bold\">te</span>st");
        // len = 5 -> Math.ceil(5 * 0.6) = 3
        assert_eq!(highlight_word("hello"), "<span class=\"br-bold\">hel</span>lo");
        // len = 6 -> Math.ceil(6 * 0.6) = 4
        assert_eq!(highlight_word("bionic"), "<span class=\"br-bold\">bion</span>ic");
        // len = 7 -> Math.ceil(7 * 0.6) = 5
        assert_eq!(highlight_word("reading"), "<span class=\"br-bold\">readi</span>ng");
    }

    #[test]
    fn test_punctuation_separation() {
        assert_eq!(highlight_word("hello,"), "<span class=\"br-bold\">hel</span>lo,");
        assert_eq!(highlight_word("(hello)"), "(<span class=\"br-bold\">hel</span>lo)");
    }

    #[test]
    fn test_stop_words() {
        assert_eq!(highlight_word("The"), "The");
        assert_eq!(highlight_word("der"), "der");
    }
}
