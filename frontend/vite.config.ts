import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const accountSwitchTest = mode === 'account-switch-test'
  const fundingRecoveryTest = mode === 'funding-recovery-test'
  const privateRecordRecoveryTest = mode === 'private-record-recovery-test'
  return {
    plugins: [react()],
    optimizeDeps: fundingRecoveryTest
      ? { entries: ['testing/funding-recovery.html'] }
      : privateRecordRecoveryTest
        ? {
            entries: ['testing/private-record-recovery.html'],
            exclude: ['@privy-io/react-auth', '@privy-io/wagmi'],
          }
        : undefined,
    resolve: {
      alias: [
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
