import type {Config} from "tailwindcss";
import daisyui from 'daisyui';

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
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
  plugins: [daisyui],
};

export default config;
