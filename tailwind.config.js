// Конфіг для збірки CSS. Після змін у HTML/JS перезберіть стилі командою:
//   npx tailwindcss@3.4.17 -i ./src/tailwind.css -o ./assets/site.css --minify
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './admin.html', './main.js'],
  theme: {
    extend: {
      colors: {
        gold: { 200: '#F0DDB8', 300: '#E5C38C', DEFAULT: '#C9A876', 500: '#B8935F', 600: '#99784E' }
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'serif'],
        sans: ['"Montserrat"', 'sans-serif']
      }
    }
  }
};
