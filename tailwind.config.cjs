/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./pages/**/*.{ts,tsx,js,jsx,mdx}",
    "./components/**/*.{ts,tsx,js,jsx,mdx}",
    "./app/**/*.{ts,tsx,js,jsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ai: {
          bg: "hsl(var(--ai-bg) / <alpha-value>)",
          "bg-muted": "hsl(var(--ai-bg-muted) / <alpha-value>)",
          fg: "hsl(var(--ai-fg) / <alpha-value>)",
          "fg-muted": "hsl(var(--ai-fg-muted) / <alpha-value>)",
          accent: "var(--ai-accent)",
          "accent-strong": "var(--ai-accent-strong)",
          "accent-soft": "var(--ai-accent-soft)",
          "accent-bg": "var(--ai-accent-bg)",
          success: "var(--ai-success)",
          warning: "var(--ai-warning)",
          error: "var(--ai-error)",
          border: "var(--ai-border-color)",
          "border-strong": "var(--ai-border-strong)",
          "border-muted": "var(--ai-border-muted)",
          "border-soft": "var(--ai-border-soft)",
        },
      },
      fontFamily: {
        notion: "var(--notion-font)",
      },
      borderRadius: {
        ai: "var(--ai-radius-md)",
        "ai-lg": "var(--ai-radius-lg)",
        "ai-sm": "var(--ai-radius-sm)",
      },
      boxShadow: {
        ai: "var(--ai-shadow-soft)",
        "ai-elevated": "var(--ai-shadow-elevated)",
      },
    },
  },
  plugins: [],
};
