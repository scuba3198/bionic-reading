#![deny(missing_docs)]
//! High-performance Bionic Reading text formatter compiled to WebAssembly.
//! Implements the patented Typo1 prefix-bolding algorithm.

use wasm_bindgen::prelude::*;

const STOP_WORDS: &[&str] = &[
    // English
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on",
    "with", "he", "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say",
    "her", "she", "or", "an", "will", "my", "one", "all", "would", "there", "their", "what",
    // German
    "der", "die", "das", "und", "ist", "in", "zu", "den", "auf", "mit", "von", "sich", "als",
    "auch", "es", "ein", "dem", "aus", "des", "wie", "sie", "im",
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
    (0x1F300..=0x1F9FF).contains(&val)
        || (0x1F600..=0x1F64F).contains(&val)
        || (0x1F680..=0x1F6FF).contains(&val)
        || (0x2600..=0x27BF).contains(&val)
}

// Typo1 algorithm from patent DE102017112916A1
fn get_fixation_length(len: usize) -> usize {
    if len <= 3 {
        1
    } else if len == 4 {
        2
    } else {
        ((len as f64) * 0.6).ceil() as usize
    }
}

/// Highlights a single word by wrapping its prefix in a bold span.
///
/// Follows the Typo1 fixation rules and isolates punctuation, skipping digits and stop words.
#[wasm_bindgen]
pub fn highlight_word(word: &str) -> String {
    if word.is_empty() {
        return String::new();
    }

    if word.chars().any(is_emoji) {
        return escape_html(word);
    }

    if word.chars().any(|c| c.is_ascii_digit()) {
        return escape_html(word);
    }

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
        let parts: Vec<String> = core.split('-').map(highlight_word).collect();
        return escape_html(&leading) + &parts.join("-") + &escape_html(&trailing);
    }

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

/// Transforms a full block of text, preserving whitespaces, by highlighting each word.
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

    mod highlight_word {
        use super::*;

        #[test]
        fn should_bold_one_char_for_three_letter_words() {
            assert_eq!(highlight_word("cat"), "<span class=\"br-bold\">c</span>at");
        }

        #[test]
        fn should_bold_two_chars_for_four_letter_words() {
            assert_eq!(
                highlight_word("test"),
                "<span class=\"br-bold\">te</span>st"
            );
        }

        #[test]
        fn should_bold_three_chars_for_five_letter_words() {
            assert_eq!(
                highlight_word("hello"),
                "<span class=\"br-bold\">hel</span>lo"
            );
        }

        #[test]
        fn should_bold_four_chars_for_six_letter_words() {
            assert_eq!(
                highlight_word("bionic"),
                "<span class=\"br-bold\">bion</span>ic"
            );
        }

        #[test]
        fn should_bold_five_chars_for_seven_letter_words() {
            assert_eq!(
                highlight_word("reading"),
                "<span class=\"br-bold\">readi</span>ng"
            );
        }

        #[test]
        fn should_bypass_english_lowercase_stop_words() {
            assert_eq!(highlight_word("the"), "the");
        }

        #[test]
        fn should_bypass_english_capitalized_stop_words() {
            assert_eq!(highlight_word("The"), "The");
        }

        #[test]
        fn should_bypass_german_stop_words() {
            assert_eq!(highlight_word("der"), "der");
        }

        #[test]
        fn should_bold_inside_trailing_punctuation() {
            assert_eq!(
                highlight_word("hello,"),
                "<span class=\"br-bold\">hel</span>lo,"
            );
        }

        #[test]
        fn should_bold_inside_surrounding_punctuation() {
            assert_eq!(
                highlight_word("(hello)"),
                "(<span class=\"br-bold\">hel</span>lo)"
            );
        }

        #[test]
        fn should_skip_words_containing_digits() {
            assert_eq!(highlight_word("v1.0.0"), "v1.0.0");
        }
    }

    mod transform_text {
        use super::*;

        #[test]
        fn should_preserve_stop_words_and_spaces_and_bold_other_words() {
            assert_eq!(
                transform_text("in a test"),
                "in a <span class=\"br-bold\">te</span>st"
            );
        }
    }
}
