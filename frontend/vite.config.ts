import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const accountSwitchTest = mode === 'account-switch-test'
  const fundingRecoveryTest = mode === 'funding-recovery-test'
  const privateRecordRecoveryTest = mode === 'private-record-recovery-test'
  const pilotLifecycleTest = mode === 'pilot-lifecycle-test'
  return {
    plugins: [react()],
    optimizeDeps: fundingRecoveryTest
      ? { entries: ['testing/funding-recovery.html'] }
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
        ...(accountSwitchTest || fundingRecoveryTest
          ? [
            {
              find: '@privy-io/react-auth',
              replacement: fileURLToPath(
                new URL(
                  fundingRecoveryTest
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
