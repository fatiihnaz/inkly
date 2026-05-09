"use client";

import { useEffect, useState } from "react";

/**
 * @typedef {Object} CountdownResult
 * @property {number} days
 * @property {number} hours
 * @property {number} minutes
 * @property {number} seconds
 * @property {boolean} past  True when the target date has passed.
 */

/**
 * Counts down to a target ISO 8601 date string, updating every second.
 *
 * @param {string|null|undefined} isoDate
 * @returns {CountdownResult}
 */
export function useCountdown(isoDate) {
  const [result, setResult] = useState(() => compute(isoDate));

  useEffect(() => {
    setResult(compute(isoDate));
    const id = setInterval(() => setResult(compute(isoDate)), 1000);
    return () => clearInterval(id);
  }, [isoDate]);

  return result;
}

/** @param {string|null|undefined} isoDate */
function compute(isoDate) {
  if (!isoDate) return zero();
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return { ...zero(), past: true };
  const totalSeconds = Math.floor(diff / 1000);
  return {
    past: false,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function zero() {
  return { past: false, days: 0, hours: 0, minutes: 0, seconds: 0 };
}