const fs = require('fs');
const content = fs.readFileSync('app.js', 'utf8');
const match = content.match(/const loadInitialData =[\s\S]*?\n\};/);
if (match) {
  console.log(match[0]);
} else {
  console.log('loadInitialData not found!');
}
