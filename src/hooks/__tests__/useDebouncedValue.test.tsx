// @vitest-environment jsdom
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDebouncedValue } from '../useDebouncedValue';

/**
 * Drives the real hook inside a real React render.
 *
 * An earlier version of this file stood in for React with fake useState and
 * useEffect and re-implemented the hook body against them. That passes whatever
 * the hook actually does, which is worse than no test: the wiring between the
 * effect, its cleanup and its dependencies is the part most likely to be wrong,
 * and a stand-in cannot exercise it.
 */
function mount<T>(initial: T, delayMs: number) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root;
  let observed: T;
  let renders = 0;

  const Probe: React.FC<{ value: T }> = ({ value }) => {
    observed = useDebouncedValue(value, delayMs);
    renders++;
    return null;
  };

  act(() => {
    root = createRoot(container);
    root.render(<Probe value={initial} />);
  });

  return {
    settled: () => observed,
    renderCount: () => renders,
    set(next: T) {
      act(() => {
        root.render(<Probe value={next} />);
      });
    },
    advance(ms: number) {
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    }
  };
}

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // React 19 reads this to decide whether act() is legal.
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    vi.useRealTimers();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('returns the initial value immediately, with no wait', () => {
    const h = mount('a', 350);
    expect(h.settled()).toBe('a');
    h.unmount();
  });

  it('holds the old value until the delay has fully elapsed', () => {
    const h = mount('a', 350);
    h.set('ab');
    h.advance(349);
    expect(h.settled()).toBe('a');
    h.advance(1);
    expect(h.settled()).toBe('ab');
    h.unmount();
  });

  it('collapses a burst of edits into a single settle', () => {
    // The point of the hook: typing an easting must trigger one triangulation,
    // not one per character.
    const h = mount('', 350);
    for (const s of ['2', '25', '254', '2548', '25480', '254800']) {
      h.set(s);
      h.advance(50);
    }
    expect(h.settled()).toBe('');
    h.advance(350);
    expect(h.settled()).toBe('254800');
    h.unmount();
  });

  it('settles on the latest value, never an intermediate one', () => {
    const h = mount('a', 100);
    h.set('b');
    h.advance(50);
    h.set('c');
    h.advance(100);
    expect(h.settled()).toBe('c');
    h.unmount();
  });

  it('stops re-rendering once the value has settled', () => {
    // A timer that rescheduled itself would keep the panel recomputing for as
    // long as it stayed open.
    const h = mount('a', 100);
    h.set('b');
    h.advance(100);
    expect(h.settled()).toBe('b');
    const after = h.renderCount();
    h.advance(5000);
    expect(h.renderCount()).toBe(after);
    h.unmount();
  });

  it('does not settle after unmount', () => {
    // The pending timer must be cleaned up, or React warns and the work is
    // wasted on a panel the user has navigated away from.
    const h = mount('a', 100);
    h.set('b');
    h.unmount();
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
  });

  it('handles a value that changes back to what it already was', () => {
    const h = mount('a', 100);
    h.set('b');
    h.advance(50);
    h.set('a');
    h.advance(500);
    expect(h.settled()).toBe('a');
    h.unmount();
  });

  it('works for a non-string value', () => {
    const h = mount(1, 100);
    h.set(2);
    h.advance(100);
    expect(h.settled()).toBe(2);
    h.unmount();
  });
});
