import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const accountSwitchTest = mode === 'account-switch-test'
  return {
    plugins: [react()],
    resolve: {
      alias: accountSwitchTest
        ? [
            {
              find: '@privy-io/react-auth',
              replacement: fileURLToPath(
                new URL('./src/testing/privyReactAuthMock.tsx', import.meta.url),
              ),
            },
            {
              find: '@privy-io/wagmi',
              replacement: fileURLToPath(
                new URL('./src/testing/privyWagmiMock.tsx', import.meta.url),
              ),
            },
          ]
        : [],
    },
  }
})
