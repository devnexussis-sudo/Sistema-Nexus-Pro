const fs = require('fs');
let code = fs.readFileSync('src/components/admin/WhatsAppInbox.tsx', 'utf-8');

code = code.replace(/chatMessages\[selected\.id\]/g, 'chatMessages[selectedId || ""]');
code = code.replace(/isLoadingHistory\[selected\.id\]/g, 'isLoadingHistory[selectedId || ""]');
code = code.replace(/olderMessages\[selected\.id\]/g, 'olderMessages[selectedId || ""]');

fs.writeFileSync('src/components/admin/WhatsAppInbox.tsx', code);
console.log("Fixed selected.id -> selectedId");
