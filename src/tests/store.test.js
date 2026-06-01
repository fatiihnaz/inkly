import { describe, it, expect, vi } from "vitest";
import { createStore } from "../lib/store.js";

describe("createStore", () => {
  it("returns the initial value from get()", () => {
    const store = createStore({ count: 0 });
    expect(store.get()).toEqual({ count: 0 });
  });

  it("set() with a value replaces state and notifies subscribers", () => {
    const store = createStore(0);
    const listener = vi.fn();
    store.subscribe(listener);
    store.set(1);
    expect(store.get()).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("set() accepts an updater function receiving the previous state", () => {
    const store = createStore(10);
    store.set((prev) => prev + 5);
    expect(store.get()).toBe(15);
  });

  it("does NOT notify when the updater returns the same reference (no-op)", () => {
    const initial = { a: 1 };
    const store = createStore(initial);
    const listener = vi.fn();
    store.subscribe(listener);
    store.set((prev) => prev); // returns same ref -> bail out
    expect(listener).not.toHaveBeenCalled();
    expect(store.get()).toBe(initial);
  });

  it("notifies every active subscriber", () => {
    const store = createStore(0);
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.set(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createStore(0);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set(1);
    expect(listener).not.toHaveBeenCalled();
  });
});