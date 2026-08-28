const fs = require('fs');
let code = fs.readFileSync('sw.js', 'utf8');
code = code.replace(/const CACHE_NAME = 'split-v14';/, "const CACHE_NAME = 'split-v15';");
fs.writeFileSync('sw.js', code);
