const fs = require('fs');
let code = fs.readFileSync('src/components/admin/WhatsAppInbox.tsx', 'utf-8');

// Fix useEffect for loadMessages
code = code.replace(/useEffect\(\(\) => \{\n\s*if \(selectedId\) loadMessages\(selectedId\);\n\s*\}, \[selectedId\]\);/g, 
`useEffect(() => {
    if (selectedId) loadMessages(selectedId);
  }, [selectedId, selected?.last_message_at]);`);

// Fix mapping to use combinedHistory instead of chatMessages
code = code.replace(/return chatMessages\[selectedId \|\| ""\]\?\.map\(\(msg, i\) => \{/g, 
`return combinedHistory.map((msg, i) => {`);

// Fix sorting logic in combinedHistory to handle both created_at and timestamp safely
code = code.replace(/Math\.abs\(new Date\(t\.timestamp\)\.getTime\(\) - new Date\(msg\.created_at \|\| msg\.timestamp \|\| new Date\(\)\)\.getTime\(\)\) < 60000/g, 
`Math.abs(new Date(t.created_at || t.timestamp || new Date()).getTime() - new Date(msg.created_at || msg.timestamp || new Date()).getTime()) < 60000`);

code = code.replace(/\)\.sort\(\(a, b\) => new Date\(a\.timestamp\)\.getTime\(\) - new Date\(b\.timestamp\)\.getTime\(\)\);/g,
`).sort((a, b) => new Date(a.created_at || a.timestamp || new Date()).getTime() - new Date(b.created_at || b.timestamp || new Date()).getTime());`);

// Also fix formatTime fallback inside the map just in case
code = code.replace(/const timeString = formatTime\(msg\.created_at \|\| msg\.timestamp \|\| new Date\(\)\.toISOString\(\)\)/g, 
`const timeString = formatTime(msg.created_at || msg.timestamp || new Date().toISOString())`);

fs.writeFileSync('src/components/admin/WhatsAppInbox.tsx', code);
console.log("Fixed rendering logic");
