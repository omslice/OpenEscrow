export type SubmittedCallbackSlot<Value> = {
  capture(callback?: (value: Value) => void): void;
  clear(): void;
  take(): ((value: Value) => void) | undefined;
};

export function createSubmittedCallbackSlot<Value>(): SubmittedCallbackSlot<Value> {
  let submittedCallback: ((value: Value) => void) | undefined;

  return {
    capture(callback) {
      submittedCallback = callback;
    },
    clear() {
      submittedCallback = undefined;
    },
    take() {
      const callback = submittedCallback;
      submittedCallback = undefined;
      return callback;
    },
  };
}
