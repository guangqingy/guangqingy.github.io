// What the single-day answer does NOT say.
//
// The converter maps one session: the underlying moves X from today's close and
// the fund moves beta * X. Traders hold these for days, and over multiple
// sessions the fund compounds its own daily returns instead of the underlying's.
// Two effects then pull in opposite directions:
//
//   trending  — a straight-line move compounds in the holder's favour for |beta| > 1
//   chopping  — round trips lose value (volatility drag), the well-known decay
//
// The straight-line case is exactly computable from the same inputs, so we show
// it as the optimistic edge and name volatility drag as the other direction.
// Nothing here forecasts a path; it re-prices the SAME total move over N days.

const EPSILON = 1e-9;

/**
 * Re-price a total underlying move as if it were spread evenly over N sessions.
 * @returns {{dailyMove:number,totalMove:number,singleDayMove:number,edge:number}|null}
 *          percentages; null when the path theoretically wipes the fund out.
 */
export function smoothPathOutcome({ underlyingMove, factor, days }) {
  const move = Number(underlyingMove) / 100;
  const beta = Number(factor);
  const sessions = Math.round(Number(days));
  if (!Number.isFinite(move) || move <= -1) return null;
  if (!Number.isFinite(beta) || Math.abs(beta) < EPSILON) return null;
  if (!Number.isInteger(sessions) || sessions < 1) return null;

  const singleDayMove = beta * move * 100;
  if (sessions === 1) {
    // A single session can still cross the theoretical total-loss boundary.
    return 1 + beta * move <= EPSILON
      ? null
      : { dailyMove: move * 100, totalMove: singleDayMove, singleDayMove, edge: 0 };
  }

  const daily = (1 + move) ** (1 / sessions) - 1;
  const leveragedDaily = 1 + beta * daily;
  if (leveragedDaily <= EPSILON) return null;

  const totalMove = (leveragedDaily ** sessions - 1) * 100;
  return {
    dailyMove: daily * 100,
    totalMove,
    singleDayMove,
    edge: totalMove - singleDayMove,
  };
}

/**
 * Cost of a round trip: the underlying returns to its anchor after swinging by
 * `swing` percent each session, while the fund does not. This is the plain
 * demonstration of volatility drag over the same number of sessions.
 * @returns {number|null} the fund's total percentage change; null on wipeout.
 */
export function roundTripDrag({ swing, factor, days }) {
  const amplitude = Number(swing) / 100;
  const beta = Number(factor);
  const sessions = Math.round(Number(days));
  if (!Number.isFinite(amplitude) || amplitude <= 0 || amplitude >= 1) return null;
  if (!Number.isFinite(beta) || Math.abs(beta) < EPSILON) return null;
  if (!Number.isInteger(sessions) || sessions < 2) return null;

  // Alternate up and down so the underlying ends flat over an even number of days.
  const pairs = Math.floor(sessions / 2);
  const up = 1 + beta * amplitude;
  const down = 1 + beta * (1 / (1 + amplitude) - 1);
  if (up <= EPSILON || down <= EPSILON) return null;
  return ((up * down) ** pairs - 1) * 100;
}
