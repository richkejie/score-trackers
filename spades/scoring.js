/*
 * Spades scoring rules.
 *
 * Pure functions only: no UI code lives here, so the rules can be tested on
 * their own (see scoring.test.html / scoring.test.js).
 *
 * Players are numbered 0-3. Players 0 and 1 are team 0; players 2 and 3 are team 1.
 *
 * A round looks like:
 *   {
 *     bids:      [3, 'nil', 4, 'blind'],   // a number 0-13, 'nil' or 'blind' (blind nil)
 *     tricks:    [5, 8],                   // total tricks won by each team (adds up to 13)
 *     nilTricks: [null, 1, null, 0]        // tricks won by each nil bidder (null for others)
 *   }
 */
(function (global) {
  'use strict';

  var TRICKS_PER_ROUND = 13;

  var DEFAULT_SETTINGS = {
    targetScore: 500,          // first team to reach this wins
    loseEnabled: true,         // a team that drops to loseScore loses
    loseScore: -200,
    pointsPerBid: 10,          // made bid: +10 per trick bid; set: -10 per trick bid
    pointsPerBag: 1,           // each overtrick ("bag") is worth this much
    bagLimit: 10,              // every this-many bags costs bagPenalty (0 = no penalty)
    bagPenalty: 100,
    nilEnabled: true,
    nilPoints: 100,            // +100 if a nil bidder takes no tricks, -100 otherwise
    blindNilEnabled: false,
    blindNilPoints: 200,
    nilTricksCountForTeam: true // tricks taken by a failed nil count toward the partner's bid
  };

  function isNilBid(bid) {
    return bid === 'nil' || bid === 'blind';
  }

  function teamOf(player) {
    return player < 2 ? 0 : 1;
  }

  /*
   * Score one team for one round (bag penalties are applied later, in scoreGame,
   * because they depend on bags carried over from earlier rounds).
   *
   * bids:       the two partners' bids, e.g. [3, 'nil']
   * teamTricks: tricks the team won in total
   * nilTricks:  tricks each partner won, only needed for nil bidders, e.g. [null, 0]
   */
  function scoreTeamRound(bids, teamTricks, nilTricks, settings) {
    var s = settings;
    var bid = 0;
    var hasContract = false;
    var nilTrickSum = 0;
    var nilPoints = 0;
    var nils = [];

    bids.forEach(function (b, seat) {
      if (isNilBid(b)) {
        var took = nilTricks[seat] || 0;
        var value = b === 'blind' ? s.blindNilPoints : s.nilPoints;
        var success = took === 0;
        var points = success ? value : -value;
        nilPoints += points;
        nilTrickSum += took;
        nils.push({ seat: seat, type: b, tricks: took, success: success, points: points });
      } else {
        bid += b;
        hasContract = true;
      }
    });

    // Tricks that count toward the team's bid.
    var contractTricks = s.nilTricksCountForTeam ? teamTricks : teamTricks - nilTrickSum;
    var made = null; // null when both partners bid nil (no bid to make)
    var bidPoints = 0;
    var bags = 0;

    if (hasContract) {
      made = contractTricks >= bid;
      if (made) {
        bidPoints = bid * s.pointsPerBid;
        bags = contractTricks - bid;
      } else {
        bidPoints = -bid * s.pointsPerBid;
      }
    }
    // Nil bidders' tricks that didn't count toward a bid are still bags.
    if (!hasContract || !s.nilTricksCountForTeam) {
      bags += nilTrickSum;
    }

    var bagPoints = bags * s.pointsPerBag;

    return {
      bid: bid,
      hasContract: hasContract,
      tricks: teamTricks,
      made: made,
      bidPoints: bidPoints,
      bags: bags,
      bagPoints: bagPoints,
      nils: nils,
      nilPoints: nilPoints,
      points: bidPoints + bagPoints + nilPoints // before any bag penalty
    };
  }

  /*
   * Decide whether the game is over. Returns { team, reason } or null.
   * If both teams pass the winning score, the higher score wins; an exact tie keeps playing.
   */
  function findWinner(totals, s) {
    var a = totals[0];
    var b = totals[1];
    if (a >= s.targetScore || b >= s.targetScore) {
      if (a !== b) return { team: a > b ? 0 : 1, reason: 'target' };
      return null;
    }
    if (s.loseEnabled) {
      var aLost = a <= s.loseScore;
      var bLost = b <= s.loseScore;
      if (aLost && !bLost) return { team: 1, reason: 'lose' };
      if (bLost && !aLost) return { team: 0, reason: 'lose' };
      if (aLost && bLost && a !== b) return { team: a > b ? 0 : 1, reason: 'lose' };
    }
    return null;
  }

  /*
   * Score a whole game from its list of rounds.
   * `start` is optional: { scores: [a, b], bags: [a, b] } for a game that was
   * already in progress (scored by hand) before the tracker was used.
   * Returns per-round results for each team, running totals, bags carried, and the winner.
   */
  function scoreGame(rounds, settings, start) {
    var s = settings;
    var totals = start ? [start.scores[0], start.scores[1]] : [0, 0];
    var bagCount = start ? [start.bags[0], start.bags[1]] : [0, 0];

    var results = rounds.map(function (round) {
      return [0, 1].map(function (t) {
        var p = t * 2;
        var res = scoreTeamRound(
          [round.bids[p], round.bids[p + 1]],
          round.tricks[t],
          [round.nilTricks[p], round.nilTricks[p + 1]],
          s
        );
        bagCount[t] += res.bags;
        var penalty = 0;
        if (s.bagLimit > 0) {
          while (bagCount[t] >= s.bagLimit) {
            bagCount[t] -= s.bagLimit;
            penalty += s.bagPenalty;
          }
        }
        res.bagPenalty = penalty;
        res.roundPoints = res.points - penalty;
        totals[t] += res.roundPoints;
        res.total = totals[t];
        res.bagsCarried = bagCount[t];
        return res;
      });
    });

    return {
      rounds: results,
      totals: totals,
      bags: bagCount,
      winner: findWinner(totals, s)
    };
  }

  function isWholeNumber(n, min, max) {
    return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
  }

  /* Returns an error message, or null if the bids are fine. */
  function validateBids(bids, settings) {
    for (var i = 0; i < 4; i++) {
      var b = bids[i];
      if (b === null || b === undefined) return 'Enter a bid for every player.';
      if (b === 'nil' && !settings.nilEnabled) return 'Nil bids are turned off for this game.';
      if (b === 'blind' && !settings.blindNilEnabled) return 'Blind nil bids are turned off for this game.';
      if (!isNilBid(b) && !isWholeNumber(b, 0, TRICKS_PER_ROUND)) {
        return 'Bids must be whole numbers from 0 to ' + TRICKS_PER_ROUND + '.';
      }
    }
    return null;
  }

  /* Returns an error message, or null if the tricks are fine. Assumes the bids are valid. */
  function validateTricks(round) {
    var tricks = round.tricks;
    if (!isWholeNumber(tricks[0], 0, TRICKS_PER_ROUND) || !isWholeNumber(tricks[1], 0, TRICKS_PER_ROUND)) {
      return 'Enter the tricks won by each team.';
    }
    if (tricks[0] + tricks[1] !== TRICKS_PER_ROUND) {
      return 'The two teams’ tricks must add up to ' + TRICKS_PER_ROUND + '.';
    }
    for (var t = 0; t < 2; t++) {
      var nilSum = 0;
      var nilCount = 0;
      for (var p = t * 2; p < t * 2 + 2; p++) {
        if (!isNilBid(round.bids[p])) continue;
        var took = round.nilTricks[p];
        if (!isWholeNumber(took, 0, TRICKS_PER_ROUND)) return 'Enter the tricks won by each nil bidder.';
        nilSum += took;
        nilCount++;
      }
      if (nilSum > tricks[t]) return 'A nil bidder can’t win more tricks than their team did.';
      if (nilCount === 2 && nilSum !== tricks[t]) {
        return 'Both partners bid nil, so their tricks must add up to the team’s total.';
      }
    }
    return null;
  }

  var api = {
    TRICKS_PER_ROUND: TRICKS_PER_ROUND,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    isNilBid: isNilBid,
    teamOf: teamOf,
    scoreTeamRound: scoreTeamRound,
    scoreGame: scoreGame,
    findWinner: findWinner,
    validateBids: validateBids,
    validateTricks: validateTricks
  };

  global.SpadesScoring = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // for running tests in Node
})(typeof window !== 'undefined' ? window : globalThis);
