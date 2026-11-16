export default defineNuxtConfig({
  compatibilityDate: '2026-10-31',
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  // modules/ holds the application's domain modules, not Nuxt modules; Nuxt
  // would load each modules/<name>/index.ts as one. No local Nuxt modules.
  dir: { modules: 'nuxt-modules' },
  css: ['~/assets/css/main.css'],
  devtools: { enabled: false },
  colorMode: { preference: 'light' },
  typescript: { strict: true },
  nitro: { externals: { external: ['pg', 'pdfjs-dist', 'mammoth'] } },
})
