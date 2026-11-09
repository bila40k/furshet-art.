// Збірка сайту перед публікацією:
//   node tools/build.js
// 1) збирає мінімальний CSS з Tailwind лише з тих класів, що реально є на сторінках;
// 2) ставить версії (?v=...) для site.css і main.js, щоб браузери не тримали старі файли в кеші.
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
process.chdir(root);

execSync('npx --yes tailwindcss@3.4.17 -c ./tailwind.config.js -i ./src/tailwind.css -o ./assets/site.css --minify', { stdio: 'inherit' });

const hash = (file) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 8);
const cssVer = hash('assets/site.css');
const jsVer = hash('main.js');

for (const page of ['index.html', 'admin.html']) {
  let html = fs.readFileSync(page, 'utf8');
  html = html.replace(/(\/assets\/site\.css\?v=)[^"']+/g, `$1${cssVer}`);
  html = html.replace(/(\/main\.js\?v=)[^"']+/g, `$1${jsVer}`);
  fs.writeFileSync(page, html);
}

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(1) + ' KB';
console.log(`site.css ${kb('assets/site.css')} (v=${cssVer}), main.js ${kb('main.js')} (v=${jsVer})`);
