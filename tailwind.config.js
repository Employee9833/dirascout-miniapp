/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Vercel-inspired neutral scale (chrome), Telegram accent for actions.
        ink: "#171717",
        sub: "#4d4d4d",
        muted: "#808080",
        line: "rgba(0,0,0,0.08)",
        surface: "#ffffff",
        tint: "#fafafa",
        accent: "var(--tg-accent, #0a72ef)",
        "accent-text": "var(--tg-accent-text, #ffffff)",
      },
      fontFamily: {
        sans: [
          "Geist",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "12px",
        btn: "8px",
        pill: "9999px",
      },
      boxShadow: {
        border: "0 0 0 1px rgba(0,0,0,0.08)",
        card: "0 0 0 1px rgba(0,0,0,0.08), 0 2px 2px rgba(0,0,0,0.04)",
      },
    },
  },
  plugins: [],
};
