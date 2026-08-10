export type AsyncOperationScope = {
  readonly key: string;
  open(): void;
  start(): number;
  isCurrent(operationId: number): boolean;
  close(): void;
};

export function createAsyncOperationScope(key = "default"): AsyncOperationScope {
  let active = true;
  let latestOperationId = 0;

  return {
    key,
    open() {
      active = true;
      latestOperationId += 1;
    },
    start() {
      latestOperationId += 1;
      return latestOperationId;
    },
    isCurrent(operationId) {
      return active && operationId === latestOperationId;
    },
    close() {
      active = false;
      latestOperationId += 1;
    },
  };
}
