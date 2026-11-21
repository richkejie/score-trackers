# Score Trackers

Score trackers for card games, built with plain HTML, CSS and JavaScript (no frameworks, no build step).

**Live site:** https://richkejie.github.io/score-trackers/

Games:
- **Spades**: 2 teams of 2, with bids, nil, blind nil, bags, and configurable rules.

## Run it locally

Open `index.html` in your browser.

## Project layout

```
index.html              Home page: the list of games
style.css               Styles shared by every page
spades/
  index.html            The Spades tracker page
  rules.html            How to play Spades (linked from the home page's "Rules" button)
  spades.css            Styles used only by the Spades tracker
  spades.js             Screens and buttons (setup → bids → tricks → result → …)
  scoring.js            The scoring rules (no UI code)
  scoring.test.js       Tests for the scoring rules
  scoring.test.html     Open in a browser to run the tests
```

A game in progress is saved in the browser (localStorage), so refreshing doesn't lose it. Each device keeps its own game.

## Tests

After changing `scoring.js`, run the tests by opening `spades/scoring.test.html` in a browser, or with Node:

```bash
node spades/scoring.test.js
```

## Adding a new game

1. Create a folder for it (e.g. `hearts/`), using `spades/` as a starting point.
2. Keep its scoring rules in a separate file so they can be tested.
3. Write a `rules.html` page explaining how to play (copy `spades/rules.html`).
4. Add it to the game list in the root `index.html`, with links to its tracker and its rules page.

## Updating the live site

The live site is published from the `main` branch with GitHub Pages.

**If you changed any `.css` or `.js` file**, first bump the version number on the links to them. Every `<link>` and `<script>` in the HTML files ends in `?v=N` (e.g. `style.css?v=3`). Search the HTML files for `?v=` to see the current number, then replace it everywhere with the next one (e.g. `?v=3` → `?v=4`). This makes browsers download the new files instead of using a stale saved copy.

Then commit your changes and push:

```bash
git add -A
git commit -m "Describe your change"
git push
```

The site updates within a minute or two. If you don't see the change, do a hard refresh in your browser (Cmd+Shift+R on Mac).

---

this shit was made with Claude
