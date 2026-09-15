const fs = require('fs');
let code = fs.readFileSync('src/components/admin/WhatsAppInbox.tsx', 'utf-8');

// 1. Add history back to the select statement
code = code.replace(/\.select\('id, phone_number, state, last_message_at, customer_id, assigned_agent_id, customers\(name, document\), users\(name\)'\)/g, 
`.select('id, phone_number, state, last_message_at, customer_id, assigned_agent_id, history, customers(name, document), users(name)')`);

// 2. Add history into combinedRaw
// Currently: const combinedRaw = [...(olderMessages[selectedId || ""] || []), ...((chatMessages[selectedId || ""] || []) || [])];
// Should be: const combinedRaw = [...(olderMessages[selectedId || ""] || []), ...((chatMessages[selectedId || ""] || []) || []), ...(selected?.history || [])];

code = code.replace(/const combinedRaw = \[\.\.\.\(olderMessages\[selectedId \|\| ""\] \|\| \[\]\), \.\.\.\(\(chatMessages\[selectedId \|\| ""\] \|\| \[\]\) \|\| \[\]\)\];/g, 
`const combinedRaw = [...(olderMessages[selectedId || ""] || []), ...((chatMessages[selectedId || ""] || []) || []), ...(selected?.history || [])];`);

fs.writeFileSync('src/components/admin/WhatsAppInbox.tsx', code);
console.log("Fixed hybrid rendering");
