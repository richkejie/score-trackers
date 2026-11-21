# Score Trackers

A small website with score trackers for games. It's plain HTML, CSS and JavaScript: no frameworks, no build step, no dependencies.

Games so far:
- **Spades**: 2 teams of 2, with bids, nil, blind nil, bags, and configurable rules.

## Run it locally

Double-click `index.html` to open it in your browser. That's it.

Or, to use a local web server (closer to how it runs when hosted):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Project layout

```
index.html              Home page: the list of games
style.css               Styles shared by every page
spades/
  index.html            The Spades tracker page
  spades.css            Styles used only by the Spades tracker
  spades.js             Screens and buttons (setup → bids → tricks → result → …)
  scoring.js            The scoring rules (pure functions, no UI)
  scoring.test.js       Tests for the scoring rules
  scoring.test.html     Open in a browser to run the tests
```

The game in progress is saved in the browser's localStorage, so a refresh or a closed tab doesn't lose it. Each device keeps its own game.

## Tests

The scoring rules have tests. Run them either way:

- Open `spades/scoring.test.html` in a browser.
- Or, if you have Node installed: `node spades/scoring.test.js`

Run them after changing `scoring.js`.

## Adding a new game

1. Create a folder for it, e.g. `hearts/`, with its own `index.html`. Copy `spades/` as a starting point.
2. Keep the scoring rules in their own file (like `scoring.js`) so they can be tested separately.
3. Add a link to it in the game list in the root `index.html`.

## Publishing on GitHub Pages

One-time setup:

1. Create a new **public** repository on GitHub (e.g. `score-trackers`). Don't add a README or other files.
2. Push this folder to it:
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/score-trackers.git
   git push -u origin main
   ```
3. On GitHub, open the repository's **Settings → Pages**. Under **Build and deployment**, set **Source** to "Deploy from a branch", choose the `main` branch and the `/ (root)` folder, and save.
4. After a minute or two the site is live at `https://YOUR-USERNAME.github.io/score-trackers/`.

After that, every `git push` to `main` updates the live site automatically.
