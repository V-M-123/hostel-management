const fs = require('fs');
const path = require('path');

function findRecursiveFunctions(dir) {
  const files = fs.readdirSync(dir, { recursive: true });
  const recursive = [];

  files.forEach(file => {
    if (!file.endsWith('.js')) return;
    const fullPath = path.join(dir, file);
    const content = fs.readFileSync(fullPath, 'utf8');

    const funcRegex = /function\s+([a-zA-Z0-9_]+)\s*\(/g;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
      const funcName = match[1];
      const startIdx = match.index;

      let braceCount = 0;
      let foundStart = false;
      let endIdx = -1;

      for (let i = startIdx; i < content.length; i++) {
        if (content[i] === '{') {
          braceCount++;
          foundStart = true;
        } else if (content[i] === '}') {
          braceCount--;
          if (foundStart && braceCount === 0) {
            endIdx = i;
            break;
          }
        }
      }

      if (endIdx !== -1) {
        const body = content.substring(startIdx, endIdx);
        const callRegex = new RegExp('\\b' + funcName + '\\s*\\(', 'g');
        const matches = body.match(callRegex);
        if (matches && matches.length > 1) {
          recursive.push({ file: fullPath, function: funcName });
        }
      }
    }
  });
  return recursive;
}

const results = findRecursiveFunctions('src');
console.log(JSON.stringify(results, null, 2));
