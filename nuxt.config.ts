export default defineNuxtConfig({
  compatibilityDate: '2026-10-31',
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  colorMode: { preference: 'light' },
  typescript: { strict: true },
  nitro: { externals: { external: ['pg', 'pdfjs-dist', 'mammoth'] } },
})
