const fs = require('fs');
let code = fs.readFileSync('src/components/admin/WhatsAppInbox.tsx', 'utf-8');

code = code.replace(/\{\(!\(chatMessages\[selectedId \|\| ""\] \|\| \[\]\) \|\| \(chatMessages\[selectedId \|\| ""\] \|\| \[\]\)\.length === 0\) && \(\!olderMessages\[selectedId \|\| ""\] \|\| olderMessages\[selectedId \|\| ""\]\.length === 0\) && \(/g, 
`{(!(chatMessages[selectedId || ""] || []) || (chatMessages[selectedId || ""] || []).length === 0) && (!olderMessages[selectedId || ""] || olderMessages[selectedId || ""].length === 0) && (!selected?.history || selected?.history.length === 0) && (`);

fs.writeFileSync('src/components/admin/WhatsAppInbox.tsx', code);
console.log("Fixed empty state logic");
