/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}", // If you decide to use a src directory
  ],
  theme: {
    extend: {
      colors: {
        'youtube-red': '#FF0000',
        'reddit-orangered': '#FF4500',
        'brand-gradient-from': '#FF0000', // youtube-red
        'brand-gradient-to': '#FF4500',   // reddit-orangered
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [
    require('tailwind-scrollbar'), // Added for scrollbar styling if needed
  ],
}; 