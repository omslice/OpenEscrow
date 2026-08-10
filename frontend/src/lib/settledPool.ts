export async function mapSettledWithConcurrency<Input, Output>(
  items: readonly Input[],
  concurrency: number,
  mapper: (item: Input, index: number) => Promise<Output>,
): Promise<PromiseSettledResult<Output>[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error("Concurrency must be a positive integer.");
  }
  if (items.length === 0) return [];

  const results = new Array<PromiseSettledResult<Output>>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = {
          status: "fulfilled",
          value: await mapper(items[index], index),
        };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    ),
  );
  return results;
}
