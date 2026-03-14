import { commonColors, heroui } from "@heroui/react"

/** @type {import("tailwindcss").Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  plugins: [
    heroui({
      addCommonColors: false,
      defaultTheme: "dark",
      themes: {
        dark: {
          colors: {
            primary: {
              ...commonColors.purple,
            },
          },
        },
      },
    }),
  ],
}
