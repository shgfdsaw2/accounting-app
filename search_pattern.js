const fs = require('fs');
const content = fs.readFileSync('app.js', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('const selectCustomerInDropdown') || line.includes('function selectCustomerInDropdown')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
