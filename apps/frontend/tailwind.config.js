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
            background: "#06060b",
            foreground: "#f5f3ff",
            divider: "rgba(255, 255, 255, 0.12)",
            overlay: "rgba(6, 6, 11, 0.78)",
            focus: commonColors.purple[500],
            content1: "#0d0d14",
            content2: "#11111a",
            content3: "#151520",
            content4: "#1c1c29",
            default: {
              ...commonColors.zinc,
              DEFAULT: "#18181b",
              foreground: "#f5f3ff",
            },
            primary: {
              ...commonColors.purple,
              DEFAULT: commonColors.purple[500],
              foreground: "#f5f3ff",
            },
            secondary: {
              ...commonColors.zinc,
              DEFAULT: "#27272a",
              foreground: "#e4e4e7",
            },
            success: {
              ...commonColors.green,
              DEFAULT: commonColors.green[500],
              foreground: "#03150a",
            },
            warning: {
              ...commonColors.yellow,
              DEFAULT: commonColors.yellow[500],
              foreground: "#1a0e02",
            },
            danger: {
              ...commonColors.red,
              DEFAULT: commonColors.red[500],
              foreground: "#1a0610",
            },
          },
          layout: {
            borderWidth: {
              small: "0px",
              medium: "0px",
              large: "0px",
            },
            boxShadow: {
              small: "none",
              medium: "none",
              large: "none",
            },
            dividerWeight: "1px",
            radius: {
              small: "0.5rem",
              medium: "0.75rem",
              large: "1rem",
            },
          },
        },
      },
    }),
  ],
}
