const fs = require('fs');
const content = fs.readFileSync('app.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (/globalSearchBar|global-search-bar/i.test(line)) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
console.log('Search completed.');
