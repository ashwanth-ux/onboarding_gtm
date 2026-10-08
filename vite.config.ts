import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (mode === 'production' && !env.VITE_LEADS_WEBHOOK_URL) {
    console.warn('\n\x1b[33m! VITE_LEADS_WEBHOOK_URL is not set: sign-ups from this build will not be saved to the Google Sheet.\x1b[0m\n')
  }
  return {}
})
