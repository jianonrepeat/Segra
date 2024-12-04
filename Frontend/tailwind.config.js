/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{vue,js,ts,tsx}'],
  theme: {
    extend: {},
  },
  daisyui: {
    themes: [
      "light",
      "dark",
      "cupcake",
      "bumblebee",
      "emerald",
      "corporate",
      "synthwave",
      "retro",
      "cyberpunk",
      "valentine",
      "halloween",
      "garden",
      "forest",
      "aqua",
      "lofi",
      "pastel",
      "fantasy",
      "wireframe",
      "black",
      "luxury",
      "dracula",
      "cmyk",
      "autumn",
      "business",
      "acid",
      "lemonade",
      "night",
      "coffee",
      "winter",
      "dim",
      "nord",
      "sunset",
      {
        recaps: {
          primary: "#EFAF2B", // Gold
          secondary: "#14B3B2", // Druid
          accent: "#E85A5A", // Poppy
          neutral: "#31333E", // Obsidian
          "base-100": "#31333E", // Necromancer (Background)
          "base-200": "#DBDAE1", // Powder
          "base-300": "#25272E", // Salt
          "base-content": "#F2F3F7", // Text color for base backgrounds
          info: "#578DDD", // Soldier
          success: "#14B3B2", // Druid (reuse for success)
          warning: "#EFAF2B", // Gold (reuse for warning)
          error: "#E85A5A", // Poppy (reuse for error)
        },
      },
    ],
  },
  plugins: [require('daisyui')],
}