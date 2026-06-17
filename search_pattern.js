const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('header-menu-dropdown')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
