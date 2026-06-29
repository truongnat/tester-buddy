/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/**/*.{ts,tsx,html}", "./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        bg: "#F4F1EA",
        surface: "#FFFFFF",
        "surface-muted": "#EDE9E2",
        text: "#1A1A1A",
        "text-muted": "#6B6560",
        border: "#D9D2C8",
        primary: "#C84B31",
        "primary-hover": "#B33E28",
        error: "#E5383B",
        success: "#1F9D55",
        warning: "#D97706",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": "11px",
        xs: "12px",
        sm: "13px",
        base: "14px",
      },
      borderRadius: {
        DEFAULT: "6px",
        sm: "4px",
        lg: "8px",
      },
    },
  },
  plugins: [],
};
