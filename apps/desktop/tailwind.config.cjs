/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/**/*.{ts,tsx,html}", "./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        bg: "#F5F7F8",
        surface: "#FFFFFF",
        "surface-muted": "#EDF2F4",
        text: "#182024",
        "text-muted": "#687378",
        border: "#D9E1E4",
        primary: "#0F9F8F",
        "primary-hover": "#0D8E7F",
        error: "#E5383B",
        success: "#1F9D55",
        warning: "#C27C0E",
      },
      fontFamily: {
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
