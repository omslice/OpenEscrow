type PendingFiatCall = {
  input: unknown;
  settled: boolean;
  resolve: (result: { status: string }) => void;
};

type FundingRecoveryTestControl = {
  resolveCall: (index: number, status: string) => void;
  snapshot: () => {
    callCount: number;
    settled: boolean[];
  };
};

declare global {
  interface Window {
    __openEscrowFundingRecoveryTest?: FundingRecoveryTestControl;
  }
}

const calls: PendingFiatCall[] = [];

async function fund(input: unknown) {
  return new Promise<{ status: string }>((resolve) => {
    calls.push({ input, settled: false, resolve });
  });
}

window.__openEscrowFundingRecoveryTest = {
  resolveCall(index, status) {
    const call = calls[index];
    if (!call || call.settled) {
      throw new Error(`Funding call ${index} is unavailable.`);
    }
    call.settled = true;
    call.resolve({ status });
  },
  snapshot() {
    return {
      callCount: calls.length,
      settled: calls.map((call) => call.settled),
    };
  },
};

export function useFiatOnramp() {
  return { fund };
}
