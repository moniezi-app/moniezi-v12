/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./services/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        brand: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        slatebg: "#dbe7ff",
      },
    },
  },
  plugins: [],
}
