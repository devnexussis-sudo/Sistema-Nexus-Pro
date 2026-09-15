const fs = require('fs');
let code = fs.readFileSync('src/components/admin/WhatsAppInbox.tsx', 'utf-8');

code = code.replace(/useEffect\(\(\) => \{\n\s*chatEndRef\.current\?\.scrollIntoView\(\{ behavior: 'smooth' \}\);\n\s*\}, \[\(chatMessages\[selectedId \|\| ""\] \|\| \[\]\)\?\.length\]\);/g, 
`useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [(chatMessages[selectedId || ""] || [])?.length, selected?.history?.length, olderMessages[selectedId || ""]?.length]);`);

fs.writeFileSync('src/components/admin/WhatsAppInbox.tsx', code);
console.log("Fixed auto-scroll");
