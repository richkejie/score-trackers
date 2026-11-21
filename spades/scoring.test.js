/*
 * Tests for scoring.js.
 * Run them either way:
 *   - open scoring.test.html in a browser, or
 *   - run `node spades/scoring.test.js` in a terminal.
 */
(function () {
  'use strict';

  var S = typeof SpadesScoring !== 'undefined' ? SpadesScoring : require('./scoring.js');
  var results = [];

  function settings(overrides) {
    return Object.assign({}, S.DEFAULT_SETTINGS, overrides || {});
  }

  function test(name, fn) {
    try {
      fn();
      results.push({ name: name, ok: true });
    } catch (e) {
      results.push({ name: name, ok: false, error: e.message });
    }
  }

  function eq(actual, expected, label) {
    if (actual !== expected) {
      throw new Error((label ? label + ': ' : '') + 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    }
  }

  function team(bids, tricks, nilTricks, overrides) {
    return S.scoreTeamRound(bids, tricks, nilTricks || [null, null], settings(overrides));
  }

  function round(bids, tricks, nilTricks) {
    return { bids: bids, tricks: tricks, nilTricks: nilTricks || [null, null, null, null] };
  }

  // --- Basic bids ---------------------------------------------------------

  test('making the bid exactly scores 10 per trick bid', function () {
    var r = team([2, 2], 4);
    eq(r.made, true, 'made');
    eq(r.points, 40, 'points');
    eq(r.bags, 0, 'bags');
  });

  test('overtricks are bags worth 1 point each', function () {
    var r = team([3, 2], 7);
    eq(r.points, 52, 'points');
    eq(r.bags, 2, 'bags');
  });

  test('going set loses 10 per trick bid', function () {
    var r = team([4, 3], 5);
    eq(r.made, false, 'made');
    eq(r.points, -70, 'points');
    eq(r.bags, 0, 'bags');
  });

  test('custom points per bid and per bag', function () {
    var r = team([3, 2], 7, null, { pointsPerBid: 5, pointsPerBag: 2 });
    eq(r.points, 25 + 4, 'points');
  });

  // --- Nil ----------------------------------------------------------------

  test('successful nil scores +100 on top of partner’s bid', function () {
    var r = team(['nil', 4], 5, [0, null]);
    eq(r.points, 40 + 1 + 100, 'points');
  });

  test('failed nil: tricks count toward partner’s bid (default)', function () {
    var r = team(['nil', 4], 5, [2, null]);
    eq(r.made, true, 'made');
    eq(r.points, 40 + 1 - 100, 'points');
  });

  test('failed nil: tricks do not count toward partner’s bid (setting off)', function () {
    var r = team(['nil', 4], 5, [2, null], { nilTricksCountForTeam: false });
    eq(r.made, false, 'made');
    eq(r.bags, 2, 'bags');
    eq(r.points, -40 + 2 - 100, 'points');
  });

  test('blind nil scores +/-200', function () {
    eq(team(['blind', 3], 3, [0, null], { blindNilEnabled: true }).points, 30 + 200, 'success');
    eq(team(['blind', 3], 4, [1, null], { blindNilEnabled: true }).points, 30 + 1 - 200, 'failure');
  });

  test('custom nil value', function () {
    eq(team(['nil', 2], 2, [0, null], { nilPoints: 50 }).points, 20 + 50);
  });

  test('both partners nil: no bid, any tricks are bags', function () {
    eq(team(['nil', 'nil'], 0, [0, 0]).points, 200, 'both made');
    var r = team(['nil', 'nil'], 2, [2, 0]);
    eq(r.made, null, 'made');
    eq(r.bags, 2, 'bags');
    eq(r.points, -100 + 100 + 2, 'one failed');
  });

  // --- Whole game ---------------------------------------------------------

  test('running totals add up across rounds', function () {
    var g = S.scoreGame([
      round([3, 2, 4, 3], [6, 7]),   // team 0: 50+1;  team 1: 70
      round([4, 4, 2, 2], [6, 7])    // team 0: -80;   team 1: 40+3
    ], settings());
    eq(g.totals[0], 51 - 80, 'team 0');
    eq(g.totals[1], 70 + 43, 'team 1');
  });

  test('reaching 10 bags costs 100 and carries the remainder', function () {
    var g = S.scoreGame([
      round([1, 1, 5, 6], [6, 7]), // team 0: 4 bags
      round([1, 1, 5, 6], [6, 7]), // team 0: 8 bags
      round([1, 1, 5, 6], [6, 7])  // team 0: 12 bags -> penalty, 2 carried
    ], settings());
    var third = g.rounds[2][0];
    eq(third.bagPenalty, 100, 'penalty');
    eq(third.roundPoints, 20 + 4 - 100, 'round points');
    eq(g.bags[0], 2, 'bags carried');
  });

  test('starting scores are added to the totals', function () {
    var g = S.scoreGame([round([3, 2, 4, 3], [6, 7])], settings(), { scores: [230, -40], bags: [0, 0] });
    eq(g.totals[0], 230 + 51, 'team 0');
    eq(g.totals[1], -40 + 70, 'team 1');
    eq(g.rounds[0][0].total, 281, 'round total includes start');
  });

  test('starting bags count toward the bag penalty', function () {
    var g = S.scoreGame([round([1, 1, 5, 6], [6, 7])], settings(), { scores: [100, 100], bags: [8, 0] });
    eq(g.rounds[0][0].bagPenalty, 100, 'penalty');
    eq(g.bags[0], 2, 'bags carried');
    eq(g.totals[0], 100 + 24 - 100, 'total');
  });

  test('no rounds yet: totals are the starting scores', function () {
    var g = S.scoreGame([], settings(), { scores: [120, 90], bags: [3, 4] });
    eq(g.totals[0], 120, 'team 0');
    eq(g.bags[1], 4, 'bags');
    eq(g.winner, null, 'winner');
  });

  test('bag limit of 0 means no bag penalty', function () {
    var rounds = [];
    for (var i = 0; i < 5; i++) rounds.push(round([1, 1, 5, 6], [6, 7]));
    var g = S.scoreGame(rounds, settings({ bagLimit: 0 }));
    eq(g.totals[0], 5 * 24, 'total');
  });

  test('winner: first team to the target score', function () {
    eq(S.findWinner([510, 300], settings()).team, 0);
    eq(S.findWinner([480, 499], settings()), null, 'nobody yet');
    eq(S.findWinner([520, 540], settings()).team, 1, 'both over: higher wins');
    eq(S.findWinner([520, 520], settings()), null, 'tie keeps playing');
    eq(S.findWinner([260, 120], settings({ targetScore: 250 })).team, 0, 'custom target');
  });

  test('loser: dropping to the losing score', function () {
    eq(S.findWinner([-200, 50], settings()).team, 1);
    eq(S.findWinner([-250, 50], settings({ loseEnabled: false })), null, 'turned off');
    eq(S.findWinner([-90, 50], settings({ loseScore: -80 })).team, 1, 'custom losing score');
  });

  // --- Validation ---------------------------------------------------------

  test('bids must be filled in and allowed', function () {
    eq(S.validateBids([1, 2, 3, null], settings()) !== null, true, 'missing bid');
    eq(S.validateBids([1, 2, 3, 4], settings()), null, 'ok');
    eq(S.validateBids(['nil', 2, 3, 4], settings({ nilEnabled: false })) !== null, true, 'nil off');
    eq(S.validateBids(['blind', 2, 3, 4], settings()) !== null, true, 'blind off by default');
    eq(S.validateBids(['blind', 2, 3, 4], settings({ blindNilEnabled: true })), null, 'blind on');
  });

  test('tricks must add up to 13 and nil tricks must fit', function () {
    eq(S.validateTricks(round([3, 3, 3, 3], [6, 6])) !== null, true, 'sum 12');
    eq(S.validateTricks(round([3, 3, 3, 3], [6, 7])), null, 'ok');
    eq(S.validateTricks(round(['nil', 3, 3, 3], [6, 7], [null, null, null, null])) !== null, true, 'nil tricks missing');
    eq(S.validateTricks(round(['nil', 3, 3, 3], [2, 11], [3, null, null, null])) !== null, true, 'nil more than team');
    eq(S.validateTricks(round(['nil', 'nil', 3, 3], [2, 11], [1, 0, null, null])) !== null, true, 'double nil must sum');
    eq(S.validateTricks(round(['nil', 'nil', 3, 3], [2, 11], [1, 1, null, null])), null, 'double nil ok');
  });

  // --- Report -------------------------------------------------------------

  var failed = results.filter(function (r) { return !r.ok; });

  if (typeof document !== 'undefined') {
    var out = document.getElementById('results');
    out.innerHTML = '<p class="summary ' + (failed.length ? 'fail' : 'pass') + '">' +
      (results.length - failed.length) + ' of ' + results.length + ' tests passed</p>' +
      '<ul>' + results.map(function (r) {
        return '<li class="' + (r.ok ? 'pass' : 'fail') + '">' + (r.ok ? '✓ ' : '✗ ') + r.name +
          (r.ok ? '' : '<br><small>' + r.error + '</small>') + '</li>';
      }).join('') + '</ul>';
  } else {
    results.forEach(function (r) {
      console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '\n      ' + r.error));
    });
    console.log('\n' + (results.length - failed.length) + ' of ' + results.length + ' tests passed');
    if (failed.length) process.exitCode = 1;
  }
})();
