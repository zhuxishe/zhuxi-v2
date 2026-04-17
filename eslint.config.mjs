import nextConfig from "eslint-config-next"

const config = [
  {
    ignores: [
      ".claude/**",
      "**/.claude/**",
      ".next/**",
      "**/.next/**",
      "packages/miniprogram/dist/**",
      "playwright-report/**",
      "test-results/**",
      "**/*.bak",
    ],
  },
  ...nextConfig,
  {
    files: ["packages/miniprogram/src/**/*.{ts,tsx}"],
    rules: {
      "jsx-a11y/alt-text": "off",
    },
  },
]

export default config
