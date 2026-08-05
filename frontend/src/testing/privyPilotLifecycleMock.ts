export function useWallets() {
  return { ready: true, wallets: [] };
}

export function usePrivy() {
  return {
    user: {
      google: {
        name: "Test Landlord",
        email: "landlord@example.test",
      },
      email: { address: "landlord@example.test" },
    },
  };
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
