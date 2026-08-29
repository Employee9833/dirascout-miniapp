/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Vercel-inspired neutral scale (chrome), Telegram accent for actions.
        // 2026-08-29 review: these used to be fixed hex values, so a dark
        // Telegram theme flipped the page background (--tg-bg, below) but
        // every card/field/pill stayed hardcoded white -- black page, white
        // boxes. All chrome tokens now read off the same themeParams-backed
        // CSS vars as bg/fg/accent, so they move together.
        ink: "var(--tg-fg, #171717)",
        sub: "color-mix(in srgb, var(--tg-fg, #171717) 65%, var(--tg-hint, #808080) 35%)",
        muted: "var(--tg-hint, #808080)",
        line: "color-mix(in srgb, var(--tg-fg, #171717) 12%, transparent)",
        surface: "var(--tg-card, #ffffff)",
        tint: "var(--tg-card, #fafafa)",
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
        border: "0 0 0 1px color-mix(in srgb, var(--tg-fg, #171717) 8%, transparent)",
        card: "0 0 0 1px color-mix(in srgb, var(--tg-fg, #171717) 8%, transparent), 0 2px 2px color-mix(in srgb, var(--tg-fg, #171717) 4%, transparent)",
      },
    },
  },
  plugins: [],
};
