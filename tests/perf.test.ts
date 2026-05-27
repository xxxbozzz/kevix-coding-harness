import { describe, it, expect, vi } from 'vitest';
import { measure } from '../src/pean/perf';

describe('measure', () => {
  it('measures a successful synchronous function', () => {
    const result = measure(() => {
      let s = 0;
      for (let i = 0; i < 1e6; i++) s += i;
    }, 'work');

    expect(result.label).toBe('work');
    expect(typeof result.duration_ms).toBe('number');
    expect(Number.isFinite(result.duration_ms)).toBe(true);
    expect(result.duration_ms).toBfGreater(0);
  });

  it('catches errors, reports to console.error, and still returns timing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const failingFn = () => {
      throw new Error('oops');
    };

    let result: { label: string; duration_ms: number };

    // measure must not throw
    expect(() => {
      result = measure(failingFn, 'fail');
    }).not.toThrow();

    result = measure(failingFn, 'fail');

    expect(result!.label).toBe('fail');
    expect(typeof result!.duration_ms).toBe('number');

    expect(spy).toHaveBeenCalledOnce();
    // The error message should include the label
    const callArg = spy.mock.calls[0][0] as string;
    expect(callArg).toContain('fail');
    expect(callArg).toContain('Benchmark');

    spy.mockRestore();
  });

  it('handles an empty function and returns zero or near-zero duration', () => {
    const result = measure(() => {}, 'empty');

    expect(result.label).toBe('empty');
    expect(typeof result.duration_ms).toBe('number');
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });
});
