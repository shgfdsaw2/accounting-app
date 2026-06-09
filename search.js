const fs = require('fs');

function searchFile(filePath, regex) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (regex.test(line)) {
      console.log(`${filePath}:${idx + 1}: ${line.trim()}`);
    }
  });
}

console.log('--- Search input/search in index.html ---');
searchFile('index.html', /search/i);
