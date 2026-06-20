const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  const lineNum = idx + 1;
  if (line.includes('id=') && (line.includes('view') || line.includes('tab') || line.includes('modal') || line.includes('settings') || line.includes('config'))) {
    console.log(`L${lineNum}: ${line.trim()}`);
  }
});
