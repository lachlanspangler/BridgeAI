# Bridge eval set

A small, redistributable set of sources for checking Bridge's explainer videos. `evals/run.ts` makes videos for each case at every length (20 s, 1 min, 3 min, 5 min) and scores:

1. **Faithfulness**: the video makes no claims the source doesn't support.
2. **Coverage**: the narration covers the hand-written key points for that length. A 20 s video must cover `k1`, and longer videos should cover more of the list.
3. **Understanding**: a fresh model sees only the video's script and on-screen text, then answers the case's `questions`.

## Layout

```
evals/
  cases/<id>.yaml              one file per case
  sources/                     stored text sources (arXiv abstracts, Wikipedia leads)
  sources/images/<id>/         stored image sets
  sources/LICENSES.md          licence and attribution for every stored file
```

There are 18 cases: 8 `text` (6 arXiv abstracts, 2 Wikipedia leads), 4 `pdf` (CC BY 4.0 arXiv papers, downloaded at eval time), 3 `project` (MIT/Apache GitHub repos, fetched at eval time) and 3 `images` (public-domain USGS/NASA/DOE diagrams and charts).

## Case schema

```yaml
id: my-case                  # kebab-case, same as the filename
kind: text                   # text | pdf | images | project
title: Human-readable title
source:
  file: evals/sources/my-case.md       # text
  url: https://arxiv.org/abs/XXXX      # pdf / project
  files: [evals/sources/images/my-case/a.png]   # images
  note: "..."                # required for images: what the images show, written only from the image and its official description
licence: "licence + attribution"
key_points:                  # 4-8, ranked; k1 is the single most important idea
  - id: k1
    text: "..."
    any: [["word", "synonym"], ["other"]]   # covered if EVERY inner list has at least one entry in the narration
questions:                   # 3-5 short factual Q/A, each tied to a key point
  - q: "..."
    a: "..."
    key: k1
```

The `any` entries are lowercase substrings. The narration is expected to be lowercased before matching, so a stem such as `"evaporat"` matches "evaporation" and "evaporates". Number variants are listed separately (e.g. `"28.4"`, `"28"`, `"twenty-eight"`).

## Adding a case

1. Pick a source you're allowed to redistribute: CC0, CC BY, CC BY-SA, public domain, or MIT/Apache for code. Check the licence on the source page. For PDFs and repos, store only the URL.
2. Text: save it as `evals/sources/<id>.md` (`# Title`, blank line, body). Images: save small renditions (300 KB or less each) in `evals/sources/images/<id>/`. Add every stored file to `sources/LICENSES.md`.
3. Read the source and write 4-8 key points, ranked by importance. Every point and answer must be directly supported by the source text. Make the `any` rules lenient but meaningful, with 1-3 groups, and check that each key point's own `text` satisfies its rule.
4. Write 3-5 questions with short answers, each pointing at a key point via `key`.
5. Keep files under 300 KB each and the whole `evals/` folder under 3 MB.
