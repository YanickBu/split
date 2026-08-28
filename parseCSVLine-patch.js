const fs = require('fs');
let code = fs.readFileSync('js/app.js', 'utf8');

const newParser = `
            const parseCSVLine = (line, delimiter = ',') => {
              const result = [];
              let current = '';
              let inQuotes = false;
              for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                  if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                  } else {
                    inQuotes = !inQuotes;
                  }
                } else if (char === delimiter && !inQuotes) {
                  result.push(current.trim());
                  current = '';
                } else {
                  current += char;
                }
              }
              result.push(current.trim());
              return result;
            };

            // Detect delimiter from first line
            const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
            const headers = parseCSVLine(lines[0], delimiter);
`;

code = code.replace(/const parseCSVLine = \(line\) => \{[\s\S]*?const headers = parseCSVLine\(lines\[0\]\);/, newParser.trim());
code = code.replace(/const lines = text\.split\(\/\\r\?\\n\/\);/, "const lines = text.split(/\\r\\n|\\n|\\r/);");
code = code.replace(/const row = parseCSVLine\(line\);/g, "const row = parseCSVLine(line, delimiter);");
code = code.replace(/const requiredHeaders = \["date", "title", "payer", "original amount", "original currency"\];/, 'const requiredHeaders = ["date", "title", "payer"];');
code = code.replace(/const origAmtStr = row\[hMap\["original amount"\]\] \|\| '0';/, 'const origAmtStr = row[hMap["original amount"]] || row[hMap["amount"]] || "0";');
code = code.replace(/const origCurr = row\[hMap\["original currency"\]\] \|\| group\.currency;/, 'const origCurr = row[hMap["original currency"]] || row[hMap["currency"]] || group.currency;');

fs.writeFileSync('js/app.js', code);
