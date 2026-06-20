const fs = require('fs');
const content = fs.readFileSync('app.js', 'utf8');
const lines = content.split('\n');
let start = 0;
let found = false;
lines.forEach((line, index) => {
  if (line.includes('const initApp =') || line.includes('function initApp')) {
    start = index;
    found = true;
  }
});
if (found) {
  for (let i = start; i < start + 30; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}
