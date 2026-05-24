use serde::Serialize;

#[derive(Debug, Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Totals {
    pub chapters: usize,
    pub scenes: usize,
    pub paragraphs: usize,
    pub sentences: usize,
    pub characters: usize,
    pub dialogue_characters: usize,
    pub narration_characters: usize,
    pub shortest_sentence_chars: usize,
    pub longest_sentence_chars: usize,
    pub average_sentence_chars: f64,
}

#[derive(Debug, Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChapterSummary {
    pub title: String,
    pub paragraphs: usize,
    pub sentences: usize,
    pub characters: usize,
    pub scenes: usize,
    pub dialogue_characters: usize,
    pub narration_characters: usize,
    pub shortest_sentence_chars: usize,
    pub longest_sentence_chars: usize,
    pub average_sentence_chars: f64,
}

#[derive(Debug, Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeResult {
    pub totals: Totals,
    pub chapters: Vec<ChapterSummary>,
}

#[tauri::command]
pub fn analyze_text(text: &str) -> AnalyzeResult {
    run(text)
}

enum Block {
    Chapter(String),
    Scene,
    Paragraph(String),
}

struct ChapterAcc {
    title: String,
    paragraphs: usize,
    sentences: usize,
    characters: usize,
    scenes: usize,
    dialogue_characters: usize,
    narration_characters: usize,
    sentence_lengths: Vec<usize>,
}

impl ChapterAcc {
    fn new(title: String) -> Self {
        Self {
            title,
            paragraphs: 0,
            sentences: 0,
            characters: 0,
            scenes: 0,
            dialogue_characters: 0,
            narration_characters: 0,
            sentence_lengths: Vec::new(),
        }
    }

    fn into_summary(self) -> ChapterSummary {
        let (min, max, avg) = sentence_stats(&self.sentence_lengths);
        ChapterSummary {
            title: self.title,
            paragraphs: self.paragraphs,
            sentences: self.sentences,
            characters: self.characters,
            scenes: self.scenes,
            dialogue_characters: self.dialogue_characters,
            narration_characters: self.narration_characters,
            shortest_sentence_chars: min,
            longest_sentence_chars: max,
            average_sentence_chars: avg,
        }
    }
}

fn run(text: &str) -> AnalyzeResult {
    let blocks = tokenize(text);

    let mut chapters: Vec<ChapterSummary> = Vec::new();
    let mut current: Option<ChapterAcc> = None;

    let mut t_scenes = 0usize;
    let mut t_paragraphs = 0usize;
    let mut t_sentences = 0usize;
    let mut t_characters = 0usize;
    let mut t_dialogue = 0usize;
    let mut t_narration = 0usize;
    let mut all_sentence_lengths: Vec<usize> = Vec::new();

    for block in blocks {
        match block {
            Block::Chapter(title) => {
                if let Some(c) = current.take() {
                    chapters.push(c.into_summary());
                }
                current = Some(ChapterAcc::new(title));
            }
            Block::Scene => {
                let c = current.get_or_insert_with(|| ChapterAcc::new(String::new()));
                c.scenes += 1;
                t_scenes += 1;
            }
            Block::Paragraph(text) => {
                let c = current.get_or_insert_with(|| ChapterAcc::new(String::new()));
                c.paragraphs += 1;
                t_paragraphs += 1;

                let para = analyze_paragraph(&text);
                c.dialogue_characters += para.dialogue_chars;
                c.narration_characters += para.narration_chars;
                c.characters += para.dialogue_chars + para.narration_chars;
                t_dialogue += para.dialogue_chars;
                t_narration += para.narration_chars;
                t_characters += para.dialogue_chars + para.narration_chars;

                for len in para.sentence_lengths {
                    c.sentences += 1;
                    c.sentence_lengths.push(len);
                    t_sentences += 1;
                    all_sentence_lengths.push(len);
                }
            }
        }
    }
    if let Some(c) = current.take() {
        chapters.push(c.into_summary());
    }

    let explicit_chapter_count = chapters.iter().filter(|c| !c.title.is_empty()).count();
    let (min_s, max_s, avg_s) = sentence_stats(&all_sentence_lengths);

    AnalyzeResult {
        totals: Totals {
            chapters: explicit_chapter_count,
            scenes: t_scenes,
            paragraphs: t_paragraphs,
            sentences: t_sentences,
            characters: t_characters,
            dialogue_characters: t_dialogue,
            narration_characters: t_narration,
            shortest_sentence_chars: min_s,
            longest_sentence_chars: max_s,
            average_sentence_chars: avg_s,
        },
        chapters,
    }
}

fn tokenize(text: &str) -> Vec<Block> {
    let mut blocks: Vec<Block> = Vec::new();
    let mut buf: Vec<&str> = Vec::new();

    let flush = |buf: &mut Vec<&str>, blocks: &mut Vec<Block>| {
        if buf.is_empty() {
            return;
        }
        let joined = buf.join("\n");
        buf.clear();
        if !joined.trim().is_empty() {
            blocks.push(Block::Paragraph(joined));
        }
    };

    for line in text.lines() {
        if let Some(title) = chapter_title(line) {
            flush(&mut buf, &mut blocks);
            blocks.push(Block::Chapter(title));
        } else if is_scene_break(line) {
            flush(&mut buf, &mut blocks);
            blocks.push(Block::Scene);
        } else if line.trim().is_empty() {
            flush(&mut buf, &mut blocks);
        } else {
            buf.push(line);
        }
    }
    flush(&mut buf, &mut blocks);

    blocks
}

fn chapter_title(line: &str) -> Option<String> {
    let trimmed = line.trim_start();
    let hashes: String = trimmed.chars().take_while(|c| *c == '#').collect();
    if hashes.is_empty() || hashes.len() > 6 {
        return None;
    }
    let rest = &trimmed[hashes.len()..];
    if !rest.starts_with(' ') && !rest.starts_with('\t') {
        return None;
    }
    Some(rest.trim().to_string())
}

fn is_scene_break(line: &str) -> bool {
    let t = line.trim();
    if t.chars().count() < 3 {
        return false;
    }
    let first = t.chars().next().unwrap();
    if !matches!(first, '*' | '-' | '=') {
        return false;
    }
    t.chars().all(|c| c == first)
}

struct ParagraphStats {
    dialogue_chars: usize,
    narration_chars: usize,
    sentence_lengths: Vec<usize>,
}

fn analyze_paragraph(text: &str) -> ParagraphStats {
    let mut dialogue_chars = 0usize;
    let mut narration_chars = 0usize;

    for (is_dialogue, span) in split_dialogue(text) {
        let span_chars = span.chars().count();
        if is_dialogue {
            dialogue_chars += span_chars;
        } else {
            narration_chars += span_chars;
        }
    }

    let sentence_lengths: Vec<usize> = collect_sentences(text)
        .into_iter()
        .map(|s| s.chars().count())
        .filter(|n| *n > 0)
        .collect();

    ParagraphStats {
        dialogue_chars,
        narration_chars,
        sentence_lengths,
    }
}

fn dialogue_closer(c: char) -> Option<char> {
    match c {
        '\u{300C}' => Some('\u{300D}'),
        '\u{300E}' => Some('\u{300F}'),
        '\u{201C}' => Some('\u{201D}'),
        '"' => Some('"'),
        _ => None,
    }
}

fn split_dialogue(text: &str) -> Vec<(bool, String)> {
    let mut segments: Vec<(bool, String)> = Vec::new();
    let mut narration_start = 0usize;
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let total = text.len();
    let mut i = 0usize;

    while i < chars.len() {
        let (byte, c) = chars[i];
        if let Some(closer) = dialogue_closer(c) {
            if narration_start < byte {
                segments.push((false, text[narration_start..byte].to_string()));
            }
            let close_idx = (i + 1..chars.len()).find(|&j| chars[j].1 == closer);
            let end_byte = match close_idx {
                Some(j) => chars[j].0 + chars[j].1.len_utf8(),
                None => total,
            };
            segments.push((true, text[byte..end_byte].to_string()));
            i = match close_idx {
                Some(j) => j + 1,
                None => chars.len(),
            };
            narration_start = end_byte;
        } else {
            i += 1;
        }
    }
    if narration_start < total {
        segments.push((false, text[narration_start..].to_string()));
    }

    segments
}

fn collect_sentences(text: &str) -> Vec<String> {
    let mut sentences: Vec<String> = Vec::new();
    let mut outer = String::new();
    let mut inner = String::new();
    let mut depth: i32 = 0;
    let mut straight_open = false;
    let mut outer_terminated = false;
    let mut inner_terminated = false;

    for c in text.chars() {
        if c == '\n' {
            flush(&mut outer, &mut sentences);
            flush(&mut inner, &mut sentences);
            depth = 0;
            straight_open = false;
            outer_terminated = false;
            inner_terminated = false;
            continue;
        }

        let opens_quote = matches!(c, '\u{300C}' | '\u{300E}' | '\u{201C}')
            || (c == '"' && !straight_open);
        let closes_quote = matches!(c, '\u{300D}' | '\u{300F}' | '\u{201D}')
            || (c == '"' && straight_open);

        if opens_quote && depth == 0 {
            inner.push(c);
            depth = 1;
            if c == '"' {
                straight_open = true;
            }
            continue;
        }

        if closes_quote && depth == 1 {
            inner.push(c);
            flush(&mut inner, &mut sentences);
            inner_terminated = false;
            depth = 0;
            if c == '"' {
                straight_open = false;
            }
            continue;
        }

        let is_terminator = matches!(c, '.' | '?' | '!' | '\u{2026}');

        if depth == 0 {
            if is_terminator {
                outer.push(c);
                outer_terminated = true;
                continue;
            }
            if outer_terminated {
                if c.is_whitespace() {
                    flush(&mut outer, &mut sentences);
                    outer_terminated = false;
                    continue;
                }
                if matches!(c, ')' | ']') {
                    outer.push(c);
                    continue;
                }
                flush(&mut outer, &mut sentences);
                outer_terminated = false;
            }
            outer.push(c);
        } else {
            if is_terminator {
                inner.push(c);
                inner_terminated = true;
                continue;
            }
            if inner_terminated {
                if c.is_whitespace() {
                    flush(&mut inner, &mut sentences);
                    inner_terminated = false;
                    continue;
                }
                flush(&mut inner, &mut sentences);
                inner_terminated = false;
            }
            inner.push(c);
        }
    }

    flush(&mut outer, &mut sentences);
    flush(&mut inner, &mut sentences);

    sentences
}

fn flush(buf: &mut String, sentences: &mut Vec<String>) {
    let t = buf.trim();
    if !t.is_empty() {
        sentences.push(t.to_string());
    }
    buf.clear();
}

fn sentence_stats(lengths: &[usize]) -> (usize, usize, f64) {
    if lengths.is_empty() {
        return (0, 0, 0.0);
    }
    let min = *lengths.iter().min().unwrap();
    let max = *lengths.iter().max().unwrap();
    let sum: usize = lengths.iter().sum();
    let avg = sum as f64 / lengths.len() as f64;
    (min, max, avg)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_text_yields_zeros() {
        let r = run("");
        assert_eq!(r.totals.chapters, 0);
        assert_eq!(r.totals.paragraphs, 0);
        assert_eq!(r.totals.sentences, 0);
        assert_eq!(r.chapters.len(), 0);
    }

    #[test]
    fn chapters_are_detected() {
        let r = run("# 1장\n\n첫 문단입니다.\n\n# 2장\n\n둘째 문단.");
        assert_eq!(r.totals.chapters, 2);
        assert_eq!(r.chapters.len(), 2);
        assert_eq!(r.chapters[0].title, "1장");
        assert_eq!(r.chapters[1].title, "2장");
        assert_eq!(r.chapters[0].paragraphs, 1);
        assert_eq!(r.chapters[1].paragraphs, 1);
    }

    #[test]
    fn preamble_is_kept_but_uncounted() {
        let r = run("도입 문단.\n\n# 1장\n\n본문.");
        assert_eq!(r.totals.chapters, 1);
        assert_eq!(r.chapters.len(), 2);
        assert!(r.chapters[0].title.is_empty());
        assert_eq!(r.chapters[1].title, "1장");
    }

    #[test]
    fn scenes_split_within_chapter() {
        let r = run("# 1장\n\n첫.\n\n***\n\n둘째.");
        assert_eq!(r.totals.chapters, 1);
        assert_eq!(r.totals.scenes, 1);
        assert_eq!(r.chapters[0].scenes, 1);
        assert_eq!(r.chapters[0].paragraphs, 2);
    }

    #[test]
    fn sentences_split_on_terminators() {
        let r = run("안녕. 반가워요! 잘 지내?");
        assert_eq!(r.totals.sentences, 3);
    }

    #[test]
    fn ellipsis_counts_as_terminator() {
        let r = run("천천히 가자\u{2026} 알았어.");
        assert_eq!(r.totals.sentences, 2);
    }

    #[test]
    fn corner_brackets_become_dialogue() {
        let r = run("그는 「잘 지내?」라고 말했다.");
        assert!(r.totals.dialogue_characters > 0);
        assert!(r.totals.narration_characters > 0);
        assert_eq!(r.totals.sentences, 2);
    }

    #[test]
    fn unclosed_quote_extends_to_end() {
        let r = run("「잘 지내");
        assert_eq!(r.totals.paragraphs, 1);
        assert!(r.totals.dialogue_characters > 0);
    }

    #[test]
    fn characters_count_unicode_chars_not_bytes() {
        let r = run("가나다.");
        assert_eq!(r.totals.characters, 4);
    }

    #[test]
    fn sentence_length_stats() {
        let r = run("짧음. 더 긴 문장입니다.");
        assert_eq!(r.totals.sentences, 2);
        assert!(r.totals.shortest_sentence_chars < r.totals.longest_sentence_chars);
        assert!(r.totals.average_sentence_chars > 0.0);
    }

    #[test]
    fn newline_inside_paragraph_breaks_sentence() {
        let r = run("첫 줄\n둘째 줄.");
        assert_eq!(r.totals.paragraphs, 1);
        assert_eq!(r.totals.sentences, 2);
    }

    #[test]
    fn scene_break_recognizes_dashes_and_equals() {
        let r = run("# 1장\n\n첫.\n\n---\n\n둘.\n\n===\n\n셋.");
        assert_eq!(r.chapters[0].scenes, 2);
    }
}
