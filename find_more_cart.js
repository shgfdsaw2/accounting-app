const fs = require('fs');
const content = fs.readFileSync('app.js', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  const lineNum = index + 1;
  if (line.includes('DOMContentLoaded') || line.includes('window.addEventListener(\'load\'') || line.includes('window.onload')) {
    console.log(`L${lineNum}: ${line.trim()}`);
  }
});
