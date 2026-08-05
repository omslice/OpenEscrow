export function useWallets() {
  return { ready: true, wallets: [] };
}

export function useSendTransaction() {
  return {
    sendTransaction: async () => {
      throw new Error(
        "Sponsored writes are outside this credential-free rehearsal.",
      );
    },
  };
}
