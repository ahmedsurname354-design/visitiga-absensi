module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,ts}"
  ],
  theme: {
    extend: {
      colors: {
        visitiga: {
          orange: "#F97316",
          orangeSoft: "#FEE2C5",
          gray: "#6B7280",
          dark: "#111827"
        }
      }
    }
  },
  plugins: []
};
