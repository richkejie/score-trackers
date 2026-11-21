/*
 * Spades score tracker: the screens and buttons.
 * The scoring rules themselves live in scoring.js.
 *
 * How it works:
 *   - Everything about the current game is in one `state` object, saved to
 *     localStorage after every change so a refresh doesn't lose the game.
 *   - `render()` redraws the whole page from `state`.
 *   - Buttons have a data-action="..." attribute naming a function in `actions`.
 *     Clicking one runs that function, then saves and redraws.
 *
 * Screens (state.phase):  setup -> bidding -> tricks -> result -> bidding -> ...
 */
(function () {
  'use strict';

  const S = window.SpadesScoring;
  const STORAGE_KEY = 'score-trackers:spades:v1';
  const app = document.getElementById('app');

  // Rule settings shown on the setup screen. `dependsOn` hides a field when that toggle is off.
  const SETTING_FIELDS = [
    { key: 'targetScore', label: 'Winning score', type: 'number' },
    { key: 'loseEnabled', label: 'A team loses if it drops to a low score', type: 'bool' },
    { key: 'loseScore', label: 'Losing score', type: 'number', dependsOn: 'loseEnabled' },
    { key: 'pointsPerBid', label: 'Points per trick bid (made: +, set: −)', type: 'number' },
    { key: 'pointsPerBag', label: 'Points per bag (overtrick)', type: 'number' },
    { key: 'bagLimit', label: 'Bags before a penalty (0 = no penalty)', type: 'number' },
    { key: 'bagPenalty', label: 'Bag penalty', type: 'number' },
    { key: 'nilEnabled', label: 'Allow nil bids', type: 'bool' },
    { key: 'nilPoints', label: 'Nil bonus / penalty', type: 'number', dependsOn: 'nilEnabled' },
    { key: 'blindNilEnabled', label: 'Allow blind nil bids', type: 'bool' },
    { key: 'blindNilPoints', label: 'Blind nil bonus / penalty', type: 'number', dependsOn: 'blindNilEnabled' },
    { key: 'nilTricksCountForTeam', label: 'Tricks won by a failed nil count toward the partner’s bid', type: 'bool' }
  ];

  let state = load();
  let error = null;          // message shown under the current step; not saved
  const openPanels = {};     // which collapsible panels on the setup screen are expanded, e.g. { rules: true }
  let pendingConfirm = null; // an action waiting for "Yes" in the on-page confirm box, e.g. 'newGame'

  // On-page confirmations. (The browser's built-in confirm() popup is blocked
  // in some browsers and in-app web views, so it can't be relied on.)
  const CONFIRMS = {
    newGame: { text: 'Start a new game? The current scores will be cleared. Players and rules are kept.', yes: 'Yes, new game' },
    undoRound: { text: 'Undo the last round? Its bids and tricks will be put back so you can re-enter them.', yes: 'Yes, undo' }
  };

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------

  function emptyDraft() {
    return { bids: [null, null, null, null], tricks: [null, null], nilTricks: [null, null, null, null] };
  }

  function emptyStart() {
    return { scores: [0, 0], bags: [0, 0] };
  }

  function hasStart() {
    return state.start.scores.some((n) => n !== 0) || state.start.bags.some((n) => n !== 0);
  }

  // Score the game so far, including any starting scores.
  function scoreGame() {
    return S.scoreGame(state.rounds, state.settings, state.start);
  }

  // A fresh game. Pass the previous game to keep its players and rules.
  function newGame(prev) {
    return {
      phase: 'setup',
      teams: prev ? copy(prev.teams) : [
        { name: '', players: ['', ''] },
        { name: '', players: ['', ''] }
      ],
      settings: Object.assign({}, S.DEFAULT_SETTINGS, prev ? prev.settings : {}),
      start: emptyStart(),     // scores and bags from before the tracker was used (game in progress)
      rounds: [],
      draft: emptyDraft(),     // the round currently being entered
      resultIndex: null,       // which round the result screen is showing
      editing: null            // { index, paused } while fixing a past round
    };
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.teams && saved.rounds) {
        saved.settings = Object.assign({}, S.DEFAULT_SETTINGS, saved.settings);
        saved.start = saved.start || emptyStart(); // games saved before starting scores existed
        return saved;
      }
    } catch (e) { /* no saved game, or storage blocked */ }
    return newGame();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* storage full or blocked: the game still works, it just won't survive a refresh */ }
  }

  function copy(x) {
    return JSON.parse(JSON.stringify(x));
  }

  // ---------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------

  function esc(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function teamName(t) {
    return state.teams[t].name.trim() || 'Team ' + (t + 1);
  }

  function playerName(p) {
    return state.teams[S.teamOf(p)].players[p % 2].trim() || 'Player ' + (p + 1);
  }

  // Numbers use a real minus sign (−), which reads better than a hyphen.
  function num(n) {
    return n < 0 ? '−' + Math.abs(n) : String(n);
  }

  function signed(n) {
    return n > 0 ? '+' + n : num(n);
  }

  function nilLabel(bid) {
    return bid === 'blind' ? 'Blind nil' : 'Nil';
  }

  // "4", "4 + Nil", "Nil + Blind nil", or "–" if a bid is missing.
  function fmtTeamBid(bids) {
    if (bids.some((b) => b === null || b === undefined)) return '–';
    const numbers = bids.filter((b) => !S.isNilBid(b));
    const parts = [];
    if (numbers.length) parts.push(String(numbers.reduce((a, b) => a + b, 0)));
    bids.filter(S.isNilBid).forEach((b) => parts.push(nilLabel(b)));
    return parts.join(' + ');
  }

  function roundNumber() {
    return state.editing ? state.editing.index + 1 : state.rounds.length + 1;
  }

  function errorHtml() {
    return error ? `<p class="error" role="alert">${esc(error)}</p>` : '';
  }

  function stepper(field, i, value, label) {
    return `
      <div class="stepper">
        <button data-action="step" data-field="${field}" data-i="${i}" data-d="-1" aria-label="Decrease ${esc(label)}">−</button>
        ${value === null || value === undefined
          ? `<output class="empty" aria-label="${esc(label)}: not entered">?</output>`
          : `<output aria-label="${esc(label)}">${value}</output>`}
        <button data-action="step" data-field="${field}" data-i="${i}" data-d="1" aria-label="Increase ${esc(label)}">+</button>
      </div>`;
  }

  function bump(current, delta) {
    if (current === null || current === undefined) return delta > 0 ? 1 : 0;
    return Math.min(S.TRICKS_PER_ROUND, Math.max(0, current + delta));
  }

  function stepHeader(title) {
    const badge = state.editing ? ' <span class="tag">Editing</span>' : '';
    return `<h2>Round ${roundNumber()} · ${title}${badge}</h2>`;
  }

  // ---------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------

  function render() {
    let html = '';
    if (state.phase === 'setup') {
      html = renderSetup();
    } else {
      const game = scoreGame();
      html = renderScoreboard(game);
      if (state.phase === 'bidding') html += renderBidding();
      if (state.phase === 'tricks') html += renderTricks();
      if (state.phase === 'result') html += renderResult(game);
      html += renderHistory(game);
      html += gameButtons();
    }
    app.innerHTML = html;
  }

  function textField(label, bind, value, placeholder) {
    return `
      <label class="field">
        <span>${label}</span>
        <input type="text" data-bind="${bind}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">
      </label>`;
  }

  function settingField(f) {
    const s = state.settings;
    if (f.dependsOn && !s[f.dependsOn]) return '';
    if (f.type === 'bool') {
      return `
        <label class="check">
          <input type="checkbox" data-bind="setting:${f.key}"${s[f.key] ? ' checked' : ''}>
          <span>${f.label}</span>
        </label>`;
    }
    return `
      <label class="field">
        <span>${f.label}</span>
        <input type="number" step="1" data-bind="setting:${f.key}" value="${s[f.key]}">
      </label>`;
  }

  function rulesSummary() {
    const s = state.settings;
    const parts = ['To ' + s.targetScore];
    if (s.loseEnabled) parts.push('lose at ' + num(s.loseScore));
    parts.push(s.bagLimit > 0 ? s.bagLimit + ' bags = −' + s.bagPenalty : 'no bag penalty');
    if (s.nilEnabled) parts.push('nil');
    if (s.blindNilEnabled) parts.push('blind nil');
    return parts.join(' · ');
  }

  function renderSetup() {
    const teams = [0, 1].map((t) => `
      <section class="card team-card team-${t}">
        <h2>Team ${t + 1}</h2>
        ${textField('Team name (optional)', 'team:' + t, state.teams[t].name, 'Team ' + (t + 1))}
        ${textField('Player', 'player:' + t + ':0', state.teams[t].players[0], 'Player ' + (t * 2 + 1))}
        ${textField('Partner', 'player:' + t + ':1', state.teams[t].players[1], 'Player ' + (t * 2 + 2))}
      </section>`).join('');

    const showBags = state.settings.bagLimit > 0;
    const startFields = [0, 1].map((t) => `
      <div class="start-team team-${t}">
        <h3>Team ${t + 1}</h3>
        <div class="start-inputs">
          <label class="field">
            <span>Score</span>
            <input type="number" step="1" data-bind="start:scores:${t}" value="${state.start.scores[t]}">
          </label>
          ${showBags ? `
          <label class="field">
            <span>Bags</span>
            <input type="number" step="1" min="0" data-bind="start:bags:${t}" value="${state.start.bags[t]}">
          </label>` : ''}
        </div>
      </div>`).join('');

    return `
      <p class="muted">Enter the players on each team. Partners sit across from each other.</p>
      ${teams}
      <details class="card" data-panel="start"${openPanels.start ? ' open' : ''}>
        <summary><strong>Game already in progress?</strong></summary>
        <div class="panel-body">
          <p class="muted small">If you’ve been keeping score by hand, enter each team’s current score${showBags ? ' and the bags they’ve collected toward the next penalty' : ''}. Leave these at 0 for a new game.</p>
          ${startFields}
        </div>
      </details>
      <details class="card settings" data-panel="rules"${openPanels.rules ? ' open' : ''}>
        <summary><strong>Rules</strong> <span class="muted small">${esc(rulesSummary())}</span></summary>
        <div class="panel-body">
          ${SETTING_FIELDS.map(settingField).join('')}
          <button class="btn-small" data-action="resetRules">Reset to standard rules</button>
        </div>
      </details>
      ${errorHtml()}
      <button class="btn-primary btn-block" data-action="start">Start game</button>`;
  }

  function renderScoreboard(game) {
    const s = state.settings;
    const teams = [0, 1].map((t) => {
      const won = game.winner && game.winner.team === t;
      const bags = s.bagLimit > 0 ? `${game.bags[t]}/${s.bagLimit} bags` : `${game.bags[t]} bags`;
      return `
        <div class="score team-${t}${won ? ' winner' : ''}">
          <div class="score-name">${esc(teamName(t))}${won ? ' 🏆' : ''}</div>
          <div class="score-players muted small">${esc(playerName(t * 2))} &amp; ${esc(playerName(t * 2 + 1))}</div>
          <div class="score-total">${num(game.totals[t])}</div>
          <div class="muted small">${bags}</div>
        </div>`;
    }).join('');
    return `
      <div class="scoreboard">${teams}</div>
      <p class="rules-line muted small">${esc(rulesSummary())}</p>`;
  }

  function renderBidding() {
    const d = state.draft;
    const s = state.settings;
    const teams = [0, 1].map((t) => {
      const rows = [t * 2, t * 2 + 1].map((p) => {
        const bid = d.bids[p];
        const nilButtons =
          (s.nilEnabled ? nilToggle(p, 'nil', bid) : '') +
          (s.blindNilEnabled ? nilToggle(p, 'blind', bid) : '');
        return `
          <div class="player-row">
            <div class="player-name">${esc(playerName(p))}</div>
            <div class="player-controls">
              ${stepper('bid', p, S.isNilBid(bid) ? null : bid, playerName(p) + '’s bid')}
              ${nilButtons ? `<div class="nil-buttons">${nilButtons}</div>` : ''}
            </div>
          </div>`;
      }).join('');
      return `
        <div class="team-block team-${t}">
          <div class="team-block-head">
            <strong>${esc(teamName(t))}</strong>
            <span class="muted small">Team bid: ${esc(fmtTeamBid(d.bids.slice(t * 2, t * 2 + 2)))}</span>
          </div>
          ${rows}
        </div>`;
    }).join('');

    return `
      <section class="card step">
        ${stepHeader('Bids')}
        <p class="muted small">Enter how many tricks each player bids.</p>
        ${teams}
        ${errorHtml()}
        <div class="btn-row">
          ${state.editing ? '<button data-action="cancelEdit">Cancel edit</button>' : ''}
          <button class="btn-primary" data-action="bidsDone">Next</button>
        </div>
      </section>`;
  }

  function nilToggle(p, type, bid) {
    const on = bid === type;
    return `<button class="btn-small toggle${on ? ' on' : ''}" aria-pressed="${on}" data-action="setNil" data-i="${p}" data-type="${type}">${nilLabel(type)}</button>`;
  }

  function renderTricks() {
    const d = state.draft;
    const teams = [0, 1].map((t) => {
      const nilRows = [t * 2, t * 2 + 1].filter((p) => S.isNilBid(d.bids[p])).map((p) => `
        <div class="player-row sub">
          <div class="player-name">
            ${esc(playerName(p))} <span class="tag">${nilLabel(d.bids[p])}</span>
            <div class="muted small">Tricks this player won</div>
          </div>
          ${stepper('nilTricks', p, d.nilTricks[p], playerName(p) + '’s tricks')}
        </div>`).join('');
      return `
        <div class="team-block team-${t}">
          <div class="player-row">
            <div class="player-name">
              <strong>${esc(teamName(t))}</strong>
              <div class="muted small">Bid ${esc(fmtTeamBid(d.bids.slice(t * 2, t * 2 + 2)))}</div>
            </div>
            ${stepper('tricks', t, d.tricks[t], teamName(t) + '’s tricks')}
          </div>
          ${nilRows}
        </div>`;
    }).join('');

    return `
      <section class="card step">
        ${stepHeader('Tricks won')}
        <p class="muted small">Enter the tricks each team won. The two teams always add up to ${S.TRICKS_PER_ROUND}, so changing one updates the other.</p>
        ${teams}
        ${errorHtml()}
        <div class="btn-row">
          <button data-action="backToBids">Back</button>
          <button class="btn-primary" data-action="tricksDone">Next</button>
        </div>
      </section>`;
  }

  function breakdownLines(t, r) {
    const lines = [];
    if (r.hasContract) {
      lines.push([`Bid ${r.bid}, won ${r.tricks} → ${r.made ? 'made' : 'set'}`, r.bidPoints]);
    }
    if (r.bags) lines.push([`${r.bags} bag${r.bags === 1 ? '' : 's'}`, r.bagPoints]);
    r.nils.forEach((n) => {
      const who = playerName(t * 2 + n.seat);
      const how = n.success ? 'made' : `failed (won ${n.tricks})`;
      lines.push([`${who} ${nilLabel(n.type).toLowerCase()} ${how}`, n.points]);
    });
    if (r.bagPenalty) lines.push(['Bag penalty', -r.bagPenalty]);
    return lines.map(([label, pts]) => `
      <div class="line"><span>${esc(label)}</span><span class="${pts < 0 ? 'neg' : 'pos'}">${signed(pts)}</span></div>`).join('');
  }

  function renderResult(game) {
    const i = state.resultIndex;
    const res = game.rounds[i];
    const teams = [0, 1].map((t) => `
      <div class="team-block team-${t}">
        <div class="team-block-head"><strong>${esc(teamName(t))}</strong></div>
        ${breakdownLines(t, res[t])}
        <div class="line total"><span>This round</span><span>${signed(res[t].roundPoints)}</span></div>
        <div class="line"><span class="muted">Game total</span><strong>${num(res[t].total)}</strong></div>
      </div>`).join('');

    let footer;
    if (state.editing) {
      footer = '<div class="btn-row"><button class="btn-primary" data-action="finishEdit">Back to game</button></div>';
    } else if (game.winner) {
      const w = game.winner;
      const why = w.reason === 'lose' ? `${esc(teamName(1 - w.team))} dropped to ${num(state.settings.loseScore)} or below.` : `First to ${state.settings.targetScore}.`;
      footer = `
        <div class="game-over">
          <p class="game-over-title">🏆 ${esc(teamName(w.team))} win${state.teams[w.team].name.trim() ? '' : 's'}!</p>
          <p class="muted small">${why}</p>
        </div>
        <div class="btn-row">
          <button class="btn-primary" data-action="rematch">New game, same players</button>
        </div>`;
    } else {
      footer = '<div class="btn-row"><button class="btn-primary" data-action="nextRound">Next round</button></div>';
    }

    return `
      <section class="card step">
        <h2>Round ${i + 1} · Score${state.editing ? ' <span class="tag">Edited</span>' : ''}</h2>
        ${teams}
        ${footer}
      </section>`;
  }

  // Short summary of one team's round for the history table, e.g. "5 / 6 · Nil ✓".
  function historyDetail(round, t) {
    const bids = round.bids.slice(t * 2, t * 2 + 2);
    const numbers = bids.filter((b) => !S.isNilBid(b));
    let text = numbers.length ? `${numbers.reduce((a, b) => a + b, 0)} / ${round.tricks[t]}` : `– / ${round.tricks[t]}`;
    bids.forEach((b, seat) => {
      if (!S.isNilBid(b)) return;
      const ok = (round.nilTricks[t * 2 + seat] || 0) === 0;
      text += ` · ${b === 'blind' ? 'BN' : 'N'} ${ok ? '✓' : '✗'}`;
    });
    return text;
  }

  function renderHistory(game) {
    if (!state.rounds.length) return '';
    const rows = state.rounds.map((round, i) => {
      const cells = [0, 1].map((t) => {
        const r = game.rounds[i][t];
        return `
          <td class="team-${t}">
            <div><span class="${r.roundPoints < 0 ? 'neg' : 'pos'}">${signed(r.roundPoints)}</span> <strong>${num(r.total)}</strong></div>
            <div class="muted small">${historyDetail(round, t)}${r.bagPenalty ? ' · bag penalty' : ''}</div>
          </td>`;
      }).join('');
      const edit = state.editing ? '' : `<button class="btn-small" data-action="editRound" data-i="${i}" aria-label="Edit round ${i + 1}">Edit</button>`;
      const current = state.editing && state.editing.index === i ? ' class="editing"' : '';
      return `<tr${current}><td class="num">${i + 1}</td>${cells}<td class="actions">${edit}</td></tr>`;
    }).reverse().join('');

    // The starting scores (game already in progress) go in a row below round 1.
    const startRow = !hasStart() ? '' : `
      <tr class="start-row">
        <td class="num"></td>
        ${[0, 1].map((t) => `
          <td class="team-${t}">
            <div><span class="muted small">Start</span> <strong>${num(state.start.scores[t])}</strong></div>
            ${state.settings.bagLimit > 0 ? `<div class="muted small">${state.start.bags[t]} bags</div>` : ''}
          </td>`).join('')}
        <td></td>
      </tr>`;

    return `
      <section class="card">
        <h2>Rounds</h2>
        <table class="history">
          <thead>
            <tr><th class="num">#</th><th class="team-0">${esc(teamName(0))}</th><th class="team-1">${esc(teamName(1))}</th><th></th></tr>
          </thead>
          <tbody>${rows}${startRow}</tbody>
        </table>
        <p class="muted small">Each cell: points this round, game total, then bid / tricks won.</p>
      </section>`;
  }

  // "Undo last round" and "New game", or the confirm box for whichever was just pressed.
  // Always shown during a game (except while editing a past round), even before round 1 is scored.
  function gameButtons() {
    if (state.editing) return '';
    if (pendingConfirm) {
      const c = CONFIRMS[pendingConfirm];
      return `
        <div class="card confirm" role="alertdialog" aria-label="Confirm">
          <p>${c.text}</p>
          <div class="btn-row">
            <button data-action="cancelConfirm">Cancel</button>
            <button class="btn-primary" data-action="${pendingConfirm}" data-confirmed="yes">${c.yes}</button>
          </div>
        </div>`;
    }
    return `
      <div class="btn-row">
        ${state.rounds.length ? '<button data-action="undoRound">Undo last round</button>' : ''}
        <button data-action="newGame">New game</button>
      </div>`;
  }

  // ---------------------------------------------------------------------
  // Actions (one per data-action="..." button)
  // ---------------------------------------------------------------------

  const actions = {
    start() {
      const s = state.settings;
      if (!(s.targetScore > 0)) {
        error = 'The winning score must be more than 0.';
      } else if (s.loseEnabled && s.loseScore >= s.targetScore) {
        error = 'The losing score must be lower than the winning score.';
      } else if (s.bagLimit < 0) {
        error = 'Bags before a penalty can’t be negative.';
      } else {
        error = startError();
      }
      if (!error) {
        if (s.bagLimit === 0) state.start.bags = [0, 0]; // bags can't be entered when there's no bag penalty
        state.phase = 'bidding';
        state.rounds = [];
        state.draft = emptyDraft();
      }
    },

    resetRules() {
      state.settings = Object.assign({}, S.DEFAULT_SETTINGS);
    },

    step(el) {
      const d = state.draft;
      const i = Number(el.dataset.i);
      const delta = Number(el.dataset.d);
      if (el.dataset.field === 'bid') {
        d.bids[i] = bump(S.isNilBid(d.bids[i]) ? null : d.bids[i], delta);
        d.nilTricks[i] = null;
      } else if (el.dataset.field === 'tricks') {
        d.tricks[i] = bump(d.tricks[i], delta);
        d.tricks[1 - i] = S.TRICKS_PER_ROUND - d.tricks[i];
      } else if (el.dataset.field === 'nilTricks') {
        d.nilTricks[i] = bump(d.nilTricks[i], delta);
      }
    },

    setNil(el) {
      const d = state.draft;
      const i = Number(el.dataset.i);
      d.bids[i] = d.bids[i] === el.dataset.type ? null : el.dataset.type;
      d.nilTricks[i] = null;
    },

    bidsDone() {
      const d = state.draft;
      error = S.validateBids(d.bids, state.settings);
      if (error) return;
      // Most nils succeed, so start nil bidders at 0 tricks.
      d.bids.forEach((b, p) => {
        if (S.isNilBid(b) && d.nilTricks[p] === null) d.nilTricks[p] = 0;
      });
      state.phase = 'tricks';
    },

    backToBids() {
      state.phase = 'bidding';
    },

    tricksDone() {
      error = S.validateTricks(state.draft);
      if (error) return;
      const round = copy(state.draft);
      if (state.editing) {
        state.rounds[state.editing.index] = round;
        state.resultIndex = state.editing.index;
      } else {
        state.rounds.push(round);
        state.resultIndex = state.rounds.length - 1;
      }
      state.phase = 'result';
    },

    nextRound() {
      state.draft = emptyDraft();
      state.resultIndex = null;
      state.phase = 'bidding';
    },

    editRound(el) {
      const i = Number(el.dataset.i);
      state.editing = {
        index: i,
        paused: { phase: state.phase, draft: state.draft, resultIndex: state.resultIndex }
      };
      state.draft = copy(state.rounds[i]);
      state.phase = 'bidding';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    cancelEdit() {
      leaveEdit();
    },

    finishEdit() {
      leaveEdit();
    },

    // Pressing the button shows the confirm box; its "Yes" button calls this again with data-confirmed.
    undoRound(el) {
      if (!state.rounds.length) return;
      if (!el.dataset.confirmed) {
        pendingConfirm = 'undoRound';
        return;
      }
      state.draft = state.rounds.pop();
      state.resultIndex = null;
      state.phase = 'bidding';
    },

    newGame(el) {
      if (!el.dataset.confirmed) {
        pendingConfirm = 'newGame';
        return;
      }
      state = newGame(state);
    },

    cancelConfirm() {
      // pendingConfirm is already cleared by the click handler
    },

    rematch() {
      state = newGame(state);
      state.phase = 'bidding';
    }
  };

  // Check the starting scores and bags; returns an error message or null.
  function startError() {
    const s = state.settings;
    for (let t = 0; t < 2; t++) {
      const name = 'Team ' + (t + 1);
      const score = state.start.scores[t];
      const bags = state.start.bags[t];
      if (score >= s.targetScore) {
        return `${name}’s starting score must be below the winning score (${s.targetScore}).`;
      }
      if (s.loseEnabled && score <= s.loseScore) {
        return `${name}’s starting score must be above the losing score (${num(s.loseScore)}).`;
      }
      if (s.bagLimit > 0 && (bags < 0 || bags >= s.bagLimit)) {
        return `${name}’s starting bags must be from 0 to ${s.bagLimit - 1}.`;
      }
    }
    return null;
  }

  // Go back to whatever screen was showing before "Edit" was pressed.
  function leaveEdit() {
    const paused = state.editing.paused;
    state.editing = null;
    state.phase = paused.phase;
    state.draft = paused.draft;
    state.resultIndex = paused.resultIndex;
    // An edit may have changed who won; if so, show the final round's result.
    const game = scoreGame();
    if (game.winner && state.phase !== 'result') {
      state.phase = 'result';
      state.resultIndex = state.rounds.length - 1;
    }
  }

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !actions[el.dataset.action]) return;
    const hadFocus = document.activeElement === el;
    const selector = Object.keys(el.dataset)
      .map((k) => `[data-${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${el.dataset[k]}"]`)
      .join('');

    const phaseBefore = state.phase;
    const roundBefore = roundNumber();

    error = null;
    pendingConfirm = null; // any click dismisses an open confirm box (the action may open a new one)
    actions[el.dataset.action](el);
    save();
    render();

    // Moving to a new screen: jump back to the top so the scoreboard and new step are in view.
    if (state.phase !== phaseBefore || roundNumber() !== roundBefore) {
      window.scrollTo(0, 0);
    } else if (hadFocus) {
      // Same screen: keep keyboard focus on the button that was pressed.
      const again = app.querySelector(selector);
      if (again) again.focus();
    }
  });

  // Text and number fields on the setup screen update state as you type (no redraw, so focus stays put).
  function handleBind(e) {
    const bind = e.target.dataset.bind;
    if (!bind) return;
    const isCheckbox = e.target.type === 'checkbox';
    if ((e.type === 'change') !== isCheckbox) return; // checkboxes use 'change', everything else 'input'

    const [kind, a, b] = bind.split(':');
    if (kind === 'team') {
      state.teams[Number(a)].name = e.target.value;
    } else if (kind === 'player') {
      state.teams[Number(a)].players[Number(b)] = e.target.value;
    } else if (kind === 'setting') {
      if (isCheckbox) {
        state.settings[a] = e.target.checked;
        save();
        render(); // show or hide the fields that depend on this toggle
        return;
      }
      const n = Number(e.target.value);
      if (e.target.value !== '' && Number.isInteger(n)) state.settings[a] = n;
    } else if (kind === 'start') {
      // An empty box counts as 0.
      const n = Number(e.target.value || 0);
      if (Number.isInteger(n)) state.start[a][Number(b)] = n;
    }
    save();
  }

  app.addEventListener('input', handleBind);
  app.addEventListener('change', handleBind);

  // Remember which setup panels are open, so redrawing doesn't close them.
  app.addEventListener('toggle', (e) => {
    if (e.target.dataset.panel) openPanels[e.target.dataset.panel] = e.target.open;
  }, true);

  openPanels.start = hasStart(); // reopen it if starting scores were already entered
  render();
})();
