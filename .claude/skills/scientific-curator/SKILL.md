---
name: scientific-curator
description: Research, verify, and add real scientific studies to the KinEdu site's "Biblioteca Científica" (research-card entries on the library page) and to an article's references section. Use this whenever the user asks to find/pesquisar/buscar artigos científicos, adicionar estudos, atualizar referências, expandir a biblioteca, or cobrir um novo tema com literatura científica — even if they just name a topic ("traz uns estudos sobre mobilidade de quadril") without saying "curator" or naming this skill explicitly. Do NOT use this for writing new article prose from scratch, and never invent a citation, DOI, or finding — if a paper can't be verified through the Scite tool, it does not get added.
---

# Scientific curator for KinEdu

This skill turns a topic into a small set of **real, verified** studies added to the site as `research-card` entries (and optionally linked into an article's `references-section`). It exists because it's easy for an LLM to "helpfully" produce a plausible-looking citation with a made-up DOI — this skill's entire job is to make that impossible by gating every entry on an actual lookup.

## What this skill is not

The site (`index.html`, `styles.css`, `script.js`) is a static, backend-less page. There is no database, no API, no user-accounts, and — critically — no real analytics: the "search" on the site's search page is a cosmetic demo, not a logging system. So this skill does **not**:
- pretend to know real search volume, page views, or saved-article counts — if the user gives you real numbers (from an analytics tool they actually have), use them for prioritization; otherwise just work from the topic they gave you
- auto-publish anything. It drafts `research-card` HTML, shows it to the user, and only commits after they say go — the open PR on the branch *is* the human-review gate, so there's no need to invent a `pending_review` status field
- write full article body prose (the multi-section `art1`–`art5` pages). Those need editorial judgment about framing and pedagogy that goes beyond "summarize this abstract accurately." If the user wants a new full article, treat that as a separate, larger task — this skill only feeds the library and reference lists.

## The one rule that matters most

**If you cannot verify a paper through `mcp__Scite__search_literature`, it does not get added — no exceptions, no "close enough."** Every DOI in the output must come from a Scite hit you actually retrieved in this run, matched against the claimed title/authors/journal/year. Don't reuse a DOI from memory or from an earlier conversation without re-checking it's still the right paper for the current citation text.

## Workflow

### 1. Establish the date window (always compute, never hardcode)

Run `date +%Y` (or equivalent) to get the current year. The floor is `current_year - 10`. Recompute this every run — don't reuse a year you calculated in a previous session, since the window moves every year. Papers published before the floor are rejected by default. If the user explicitly asks for a foundational/classic paper outside the window (e.g., "esse é o paper original do Schoenfeld sobre isso, quero incluir mesmo sendo de 2010"), that's their call to make explicitly, but don't default to it.

### 2. Expand the topic into search terms

Don't search only the exact phrase the user typed. Build a small semantic map: the topic in Portuguese, its natural English equivalent(s), and 2-4 closely related technical terms a researcher in the field would use. For example "mobilidade de quadril" → `hip mobility`, `hip range of motion`, `hip flexor flexibility`, `hip joint mobility training`. This matters because the underlying literature is almost entirely in English, and a narrow PT-only search will starve the results.

### 3. Search and prioritize by study type, not recency alone

Call `mcp__Scite__search_literature` with `term` set to your expanded queries (run a few variations — one broad, a couple narrower) and `date_from` set to the computed floor year. Within the results, prefer in this order: meta-analyses and systematic reviews > RCTs > position stands / consensus statements > prospective cohort studies > narrative reviews > everything else. A recent narrative review is not better evidence than a slightly-older meta-analysis — recency is a filter (must be within 10 years), not a ranking signal.

Pull up to ~15-20 candidates across your queries before narrowing — you'll reject a good number of them in the next step, and starting narrow means you run out of good options. That said, the Scite tool's free tier is small (a handful of searches before it starts asking for a paid plan — this has already happened mid-session on this project once), so don't burn it on redundant queries: the `titles`/`dois` parameters accept arrays, so batch several candidates into one call instead of one-at-a-time lookups, and stop broadening your search once you have enough good candidates rather than exhaustively covering every possible phrasing. If you hit the quota wall mid-run, stop and tell the user what you'd verified so far and what's still unconfirmed — don't guess at the rest to finish the batch.

### 4. Validate every candidate

For each candidate you're seriously considering, check:
- **It's a real, resolvable paper.** You already have this from the Scite hit (DOI, journal, volume/issue/page) — don't take a title match on faith if the returned authors/journal look inconsistent with the citation you're trying to support; when that happens, do a follow-up `dois: [...]` lookup on that exact DOI to double check before trusting it (this happened during the earlier reference-linking pass on this site — Scite's author field was garbled for one otherwise-correct DOI; the volume/issue/page match was what settled it).
- **Within the date window.** Reject anything published before `current_year - 10`. Note online-first vs. print-issue year mismatches are common and fine as long as volume/issue/page line up.
- **Not retracted or seriously flagged.** Check `editorialNotices` on the hit — skip anything with a retraction, or flag corrections/concerns to the user rather than silently ignoring them.
- **Not already on the site.** Before drafting anything, grep the repo for the candidate DOI:
  ```
  grep -c "doi.org/<DOI>" index.html
  ```
  If it's already there (as a `.ref-link` or `.rc-doi`), skip it — don't add a duplicate. Do this DOI check before you spend a search on a paper, not after — grep `href="https://doi.org/` once at the start of a run to see what's already covered. One caveat: a few `research-card` entries on `p-library` predate real DOI links (still `href="#"`) and won't show up in a DOI grep — for those, also eyeball candidate titles against the existing `.rc-title` text on the library page so you don't re-add a paper that's already there under a placeholder link.
- **Actually relevant**, not just keyword-adjacent. A hit that mentions the topic in passing while being about something else isn't a fit.

Anything that fails one of these gets left out — don't explain the near-misses in the final card, just don't include them. (You can mention what you rejected and why in your summary to the user, though — that's useful signal, not clutter.)

### 5. Classify and map to the site's existing visual system

The library page (`p-library`) already has a closed vocabulary for study type and topic — reuse it exactly, don't invent new badge colors or tag styles unless a genuinely new topic area is needed (and if so, add a new `.rt-<slug>` CSS rule following the same `rgba(...) background + solid color text` pattern used by the existing ones, don't reuse a wrong tag just because it's already there).

**Study type → badge class → evidence dots** (5-dot scale, filled = `eg-dot on`, empty = `eg-dot`):

| Study type | Badge class | Badge label | Dots filled |
|---|---|---|---|
| Meta-analysis | `eb-meta` | Meta-análise | 5 |
| Systematic review | `eb-syst` | Revisão Sistemática | 5 |
| Position stand / consensus statement | `eb-pos` | Position Stand | 4 |
| Randomized controlled trial | `eb-rct` | RCT | 4 |
| Systematic review of narrower scope / scoping review | `eb-review` | Revisão | 3 |
| Prospective cohort / longitudinal | *(reuse eb-rct styling if no better fit, label it clearly in the title/abstract instead)* | — | 3 |
| Narrative review | `eb-narr` | Revisão Narrativa | 2 |
| Cross-sectional, case-control, case report, pilot study | *(use narrative badge, and say what it actually is in the abstract text)* | — | 1-2 |

Don't inflate dots because a paper is well-cited or recent — the dots reflect study design's position in the evidence hierarchy, nothing else.

**Topic tags** (`rc-tag rt-<slug>`, pick 1-2 that genuinely apply): `rt-hypert` (Hipertrofia), `rt-strength` (Força), `rt-biomech` (Biomecânica), `rt-nutrition` (Nutrição), `rt-physio` (Fisiologia). If the topic doesn't fit any of these — e.g. mobility, recovery, injury rehab — check `styles.css` for whether a matching category already exists elsewhere on the site (categories like Anatomia, Potência, Periodização, Psicologia, Recuperação appear on the home/category pages) and add a small matching `.rt-<slug>` rule near the others in `styles.css` rather than mis-tagging.

### 6. Write the summary honestly

The `rc-abstract` text is the one-paragraph translation of the paper for a KinEdu reader. Ground it strictly in the abstract (and full-text excerpts, when Scite returns them) — pull out the concrete numbers (sample size, effect size, key comparison) the way the existing cards do (e.g. "*21 estudos (n=476)*", bolded). Do not:
- turn a correlation into causation the paper didn't claim
- generalize a narrow population (e.g. "45 untrained women") to "everyone," or to the wrong population, without saying who was actually studied
- change the exercise, intervention, or comparison the study actually used — write down what's in the abstract in front of you, not what a similar-sounding study on the topic would probably have done
- add a practical recommendation the authors didn't make, even if it seems like a reasonable inference — if you want to add a practical note, keep it clearly separate from what the study found (e.g. a closing sentence, not folded into the finding itself)
- silently drop caveats the authors themselves flagged (small sample, single population, industry funding, etc.) if they're central to interpreting the result

This isn't a hypothetical risk — one of the existing `research-card` entries on the live site (Pedrosa et al. 2022, still on `p-library` as of this skill being written) describes the cited study as "40 participantes treinados... agachamento em amplitude parcial vs. completa... 44% maior hipertrofia de quadríceps." The actual paper (same DOI, verified via Scite) is 45 *untrained women*, a *knee-extension* exercise across four ROM conditions, with no single 44%-style headline figure in the abstract. Nobody added a fake DOI here — the DOI is completely real — but the summary text drifted from what the paper says into something that reads like a different, more quotable study. That's the exact failure mode this step exists to prevent: verifying the citation is not the same as verifying the description of it. Reread the abstract text you're about to write against the actual abstract one more time before finalizing.

Write in Portuguese, matching the register of the existing cards. Keep bibliographic fields (title, author names, journal name) in their original language/spelling — those don't get translated.

### 7. Draft, don't commit yet

Produce one `research-card` block per accepted study, following this exact shape (this is real markup lifted from `p-library` in `index.html` — match it, don't improvise a new structure):

```html
<div class="research-card">
  <div class="rc-top">
    <span class="ev-badge eb-rct">RCT</span>
    <div class="rc-title-block">
      <div class="rc-journal">{Journal Name} · {Year}</div>
      <div class="rc-title">{Original title, not translated}</div>
      <div class="rc-authors">{Author A, Author B, et al.}</div>
    </div>
  </div>
  <div class="rc-abstract">{PT summary, quantitative highlights in <strong></strong>}</div>
  <div class="rc-footer">
    <span class="rc-tag rt-{slug}">{Tag label}</span>
    <span class="rc-tag rt-{slug2}">{Second tag label, only if a second one genuinely applies}</span>
    <div class="evidence-grade"><span class="eg-label">Evidência:</span><div class="eg-dots">{5 eg-dot divs, on/off per table above}</div></div>
    <span class="rc-year">{Year}</span>
    <a class="rc-doi" href="https://doi.org/{DOI}" target="_blank" rel="noopener noreferrer">DOI →</a>
  </div>
</div>
```

Don't add an `onclick`/`cursor:pointer` to the card — the existing ones on the site used to have `onclick="location.href='sc-article.html'"`, which was broken (malformed escaping threw a JS error on every click) and pointed at a page that doesn't exist in this SPA anyway. That's been removed from all five existing cards; the `rc-doi` link is the card's only real destination. Some existing cards still have `href="#"` placeholders where the DOI was never filled in — if you happen to verify one of those exact papers in an unrelated run, it's worth fixing while you're there (call it out to the user, don't do it silently), but don't go hunting for them as their own task unless asked.

Show the drafted cards to the user (render them in your response, or describe them clearly) before writing anything to disk. This is the validation gate from the user's original spec — "PENDING_REVIEW" here just means: you show them, they say yes, then you edit files.

### 8. Publish (only after the user confirms)

- Insert the approved `research-card` blocks into `p-library`'s card list in `index.html`.
- If a study is directly relevant to one of the existing full articles (`art1`-`art5`), ask the user whether they also want it added to that article's `references-section` (reusing the pattern with `.ref-link` from the earlier reference-linking work on this site) — don't add it there unprompted, since that changes the article's citation list, not just the library.
- Run the same regression checks used elsewhere on this project before committing: `<div>`/`</div>` balance stays even, and a quick headless-browser pass on `p-library` shows the new cards rendering without JS errors.
- Commit, push to the current branch (this repo has an open PR that tracks pushes automatically — no separate PR-creation step needed unless the user is on a fresh branch).

### 9. Log the run

Append a short entry to `.claude/skills/scientific-curator/curation-log.md` (create it if it doesn't exist) recording: date, topic searched, search terms used, how many candidates were found vs. accepted vs. rejected (with a one-line reason for rejections — outside date window, duplicate, unverifiable, off-topic, retracted), and the DOIs added. This is cheap to write and is the only real audit trail available without a database — keep entries short, this is a log, not a report.

## A worked example of the rejection reasoning

If the user asks for studies on "hipertrofia" and a promising-looking hit turns out to be from 2014, don't quietly drop it and move on — say so: "achei uma revisão da Schoenfeld que seria ótima mas é de 2014, fora da janela de 10 anos, então não entrou; segue as 4 que passaram." That's more useful than a silent gap, and it's exactly the kind of transparency the validation step exists for.
