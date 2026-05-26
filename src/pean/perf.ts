/**
 * Lightweight benchmarking utility.
 * Measures wall-clock execution time of a synchronous function.
 * Never throws — catches errors and reports via console.error.
 */

export function measure(
  fn: () => void,
  label: string,
): { label: string; duration_ms: number } {
  const start = performance.now();

  try {
    fn();
  } catch (e) {
    console.error(`Benchmark "${label}" error:`, e);
  } finally {
    const end = performance.now();
    const duration_ms = end - start;
    return { label, duration_ms };
  }
}
