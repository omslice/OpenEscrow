import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const accountSwitchTest = mode === 'account-switch-test'
  const fundingRecoveryTest = mode === 'funding-recovery-test'
  const fundingProductionLockTest = mode === 'funding-production-lock-test'
  const fiatFundingTest = fundingRecoveryTest || fundingProductionLockTest
  const privateRecordRecoveryTest = mode === 'private-record-recovery-test'
  const evidenceRecoveryTest = mode === 'evidence-recovery-test'
  const pilotLifecycleTest = mode === 'pilot-lifecycle-test'
  return {
    plugins: [react()],
    optimizeDeps: fiatFundingTest
      ? { entries: ['testing/funding-recovery.html'] }
      : evidenceRecoveryTest
        ? {
            entries: ['testing/evidence-recovery.html'],
            exclude: ['@privy-io/react-auth', '@privy-io/wagmi'],
          }
        : pilotLifecycleTest
        ? {
            entries: ['testing/pilot-lifecycle.html'],
            exclude: ['@privy-io/react-auth', '@privy-io/wagmi'],
          }
          : privateRecordRecoveryTest
            ? {
                entries: ['testing/private-record-recovery.html'],
                exclude: ['@privy-io/react-auth', '@privy-io/wagmi'],
              }
            : undefined,
    resolve: {
      alias: [
        ...(pilotLifecycleTest
          ? [
              {
                find: '@privy-io/react-auth',
                replacement: fileURLToPath(
                  new URL(
                    './src/testing/privyPilotLifecycleMock.ts',
                    import.meta.url,
                  ),
                ),
              },
              {
                find: /^wagmi$/,
                replacement: fileURLToPath(
                  new URL(
                    './src/testing/wagmiPilotLifecycleMock.ts',
                    import.meta.url,
                  ),
                ),
              },
            ]
          : []),
        ...(privateRecordRecoveryTest
          ? [
              {
                find: '@privy-io/react-auth',
                replacement: fileURLToPath(
                  new URL(
                    './src/testing/privyPilotLifecycleMock.ts',
                    import.meta.url,
                  ),
                ),
              },
              {
                find: /^wagmi$/,
                replacement: fileURLToPath(
                  new URL(
                    './src/testing/wagmiPrivateRecordRecoveryMock.ts',
                    import.meta.url,
                  ),
                ),
              },
            ]
          : []),
        ...(evidenceRecoveryTest
          ? [
              {
                find: /^wagmi$/,
                replacement: fileURLToPath(
                  new URL(
                    './src/testing/wagmiEvidenceRecoveryMock.ts',
                    import.meta.url,
                  ),
                ),
              },
            ]
          : []),
        ...(accountSwitchTest || fiatFundingTest
          ? [
            {
              find: '@privy-io/react-auth',
              replacement: fileURLToPath(
                new URL(
                  fiatFundingTest
                    ? './src/testing/privyFiatOnrampMock.ts'
                    : './src/testing/privyReactAuthMock.tsx',
                  import.meta.url,
                ),
              ),
            },
            {
              find: '@privy-io/wagmi',
              replacement: fileURLToPath(
                new URL('./src/testing/privyWagmiMock.tsx', import.meta.url),
              ),
            },
          ]
          : []),
      ],
    },
  }
})
