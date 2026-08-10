/* oxlint-disable react/only-export-components -- This test-only module intentionally mirrors Privy's component-and-hook API. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type TestAccountId = "account-a" | "account-b";

type TestWallet = {
  address: `0x${string}`;
  walletClientType: "privy";
};

type TestAccount = {
  id: string;
  email: string;
  name: string;
  token: string;
  wallet: TestWallet;
};

type TestSnapshot = {
  currentAccount: TestAccountId;
  loginAttempts: Array<"google" | "wallet">;
  logoutCalls: Record<TestAccountId, number>;
  walletAttempts: Record<TestAccountId, number>;
  walletCounts: Record<TestAccountId, number>;
};

type AccountSwitchTestControl = {
  switchAccount: (accountId: TestAccountId) => void;
  resolveWallet: (accountId: TestAccountId) => void;
  snapshot: () => TestSnapshot;
};

declare global {
  interface Window {
    __openEscrowAccountSwitchTest?: AccountSwitchTestControl;
  }
}

const ACCOUNTS: Record<TestAccountId, TestAccount> = {
  "account-a": {
    id: "did:privy:account-a",
    email: "account.a@example.test",
    name: "Account A",
    token: "identity-token-a",
    wallet: {
      address: "0xA00000000000000000000000000000000000000A",
      walletClientType: "privy",
    },
  },
  "account-b": {
    id: "did:privy:account-b",
    email: "account.b@example.test",
    name: "Account B",
    token: "identity-token-b",
    wallet: {
      address: "0xB00000000000000000000000000000000000000B",
      walletClientType: "privy",
    },
  },
};

type MockContextValue = {
  accountId: TestAccountId;
  account: TestAccount;
  authenticated: boolean;
  wallets: TestWallet[];
  createWallet: () => Promise<void>;
  login: (options?: {
    loginMethods?: Array<"google" | "wallet">;
  }) => Promise<void>;
  logout: () => Promise<void>;
  switchAccount: (accountId: TestAccountId) => void;
};

const MockPrivyContext = createContext<MockContextValue | null>(null);

function useMockPrivyContext() {
  const value = useContext(MockPrivyContext);
  if (!value) throw new Error("The account-switch test provider is missing.");
  return value;
}

export function PrivyProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<TestAccountId>("account-a");
  const [authenticated, setAuthenticated] = useState(
    () =>
      !new URLSearchParams(window.location.search).has(
        "public-access-test",
      ),
  );
  const [wallets, setWallets] = useState<Record<TestAccountId, TestWallet[]>>({
    "account-a": [],
    "account-b": [],
  });
  const attemptsRef = useRef<Record<TestAccountId, number>>({
    "account-a": 0,
    "account-b": 0,
  });
  const logoutCallsRef = useRef<Record<TestAccountId, number>>({
    "account-a": 0,
    "account-b": 0,
  });
  const loginAttemptsRef = useRef<Array<"google" | "wallet">>([]);
  const walletsRef = useRef(wallets);
  walletsRef.current = wallets;
  const accountIdRef = useRef(accountId);
  accountIdRef.current = accountId;
  const walletResolvers = useRef<
    Record<TestAccountId, Array<() => void>>
  >({
    "account-a": [],
    "account-b": [],
  });

  const switchAccount = useCallback((next: TestAccountId) => {
    setAccountId(next);
  }, []);

  const createWallet = useCallback(async () => {
    const requestedAccount = accountIdRef.current;
    attemptsRef.current[requestedAccount] += 1;
    await new Promise<void>((resolve) => {
      walletResolvers.current[requestedAccount].push(resolve);
    });
    setWallets((current) => ({
      ...current,
      [requestedAccount]: [ACCOUNTS[requestedAccount].wallet],
    }));
  }, []);

  const logout = useCallback(async () => {
    logoutCallsRef.current[accountIdRef.current] += 1;
  }, []);
  const login = useCallback(async (options?: {
    loginMethods?: Array<"google" | "wallet">;
  }) => {
    const method = options?.loginMethods?.[0];
    if (method === "google" || method === "wallet") {
      loginAttemptsRef.current.push(method);
    }
    if (
      new URLSearchParams(window.location.search).has("login-reject-test") &&
      loginAttemptsRef.current.length <= 2
    ) {
      throw new Error("Synthetic account-provider rejection.");
    }
    setAuthenticated(true);
  }, []);

  useEffect(() => {
    window.__openEscrowAccountSwitchTest = {
      switchAccount,
      resolveWallet(requestedAccount) {
        const resolvers = walletResolvers.current[requestedAccount].splice(0);
        resolvers.forEach((resolve) => resolve());
      },
      snapshot() {
        return {
          currentAccount: accountIdRef.current,
          loginAttempts: [...loginAttemptsRef.current],
          logoutCalls: { ...logoutCallsRef.current },
          walletAttempts: { ...attemptsRef.current },
          walletCounts: {
            "account-a": walletsRef.current["account-a"].length,
            "account-b": walletsRef.current["account-b"].length,
          },
        };
      },
    };
    return () => {
      delete window.__openEscrowAccountSwitchTest;
    };
  }, [switchAccount]);

  return (
    <MockPrivyContext.Provider
      value={{
        accountId,
        account: ACCOUNTS[accountId],
        authenticated,
        wallets: wallets[accountId],
        createWallet,
        login,
        logout,
        switchAccount,
      }}
    >
      {children}
    </MockPrivyContext.Provider>
  );
}

export function usePrivy() {
  const { account, authenticated, login, logout, switchAccount } =
    useMockPrivyContext();
  return {
    ready: true,
    authenticated,
    user: {
      id: account.id,
      google: {
        email: account.email,
        name: account.name,
      },
    },
    login,
    logout,
    linkGoogle: async () => undefined,
    linkWallet: async () => undefined,
    __switchAccount: switchAccount,
  };
}

export function useLoginWithOAuth() {
  const { login } = useMockPrivyContext();
  return {
    initOAuth: () => login({ loginMethods: ["google"] }),
    loading: false,
    state: "initial",
  };
}

export function useIdentityToken() {
  const { account } = useMockPrivyContext();
  return { identityToken: account.token };
}

export function useWallets() {
  const { wallets } = useMockPrivyContext();
  return { ready: true, wallets };
}

export function useCreateWallet() {
  const { createWallet } = useMockPrivyContext();
  return { createWallet };
}
