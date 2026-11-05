# Study Hub

A static revision website in `docs/`, served by GitHub Pages from the `main` branch, `/docs` folder.
Live at https://nbastudyhub.github.io/D1Trappy/ (repository `nbastudyhub/D1Trappy`; the owner was previously `d1trappy`). No build step and no server.

- `docs/index.html`, `docs/app.js`, `docs/style.css`: the site
- `docs/decks/<id>.json`: one study pack per lesson / PowerPoint
- `docs/decks/index.json`: the list of packs. Generated, don't edit by hand
- `scripts/build-index.mjs`: checks every pack and rebuilds the list

The student is learning these topics for the first time and is aiming for the top grade (D*).

## Adding a new deck (the usual request)

When the user uploads slides (PDF or PowerPoint):

1. Read every slide, including speaker notes.
2. Write `docs/decks/<id>.json`. The `<id>` is lowercase words joined with hyphens, e.g. `a2-5-third-party-reviews`.
3. Run `node scripts/build-index.mjs` and fix anything it reports.
4. Commit and push. The live site is built from `main`, and the owner wants new lessons published there: if you are working on another branch, bring `main` up to date with your work too (a fast-forward, or a pull request if `main` has moved on). The site updates about a minute after `main` changes.

The site's "Add a lesson" page (`#add-lesson`) tells people to open Claude Code on this repository, attach their slides and send "Add this lesson to the Study Hub and publish it." Treat that message as this request.

Build the pack only from the slides. Short standard explanations are fine, but don't add topics the slides don't cover. If the slides have their own warm-ups, check-ins, case studies or exam questions, include them with correct answers and mark schemes. Use plain UK English and short sentences.

## Deck format

Copy `docs/decks/a2-4-tools-to-assess-vulnerabilities.json` as the example.

```jsonc
{
  "id": "same as the file name",
  "title": "Topic title",
  "code": "Unit/spec code, e.g. IT · A2.4.1 – A2.4.6",
  "subject": "Information Technology",
  "added": "YYYY-MM-DD",
  "bigQuestion": "The lesson's big question",
  "sections": [ { "heading": "", "text": "", "points": [""], "table": { "head": [""], "rows": [[""]] } } ], // 5-10; table optional
  "keyIdea": "Most important takeaway",
  "flashcards": [ ["term", "definition"] ],                       // 15-30
  "quiz": [ { "q": "", "o": ["", ""], "a": 0, "e": "why" } ],      // 12-18; a = index of right option, vary its position
  "apply": { "title": "e.g. Pick the tool", "intro": "", "items": [ { "task": "scenario", "o": [""], "a": 0, "e": "" } ] }, // 8-12
  "exam": [ { "sc": "scenario or empty", "q": "1. Explain…", "m": 2, "pts": ["one marking point per mark"], "tip": "how to get full marks" } ] // 6-10, 20-35 marks total
}
```

For "explain" questions, write `pts` as a point and then a linked reason.
