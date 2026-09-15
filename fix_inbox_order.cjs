const fs = require('fs');
let code = fs.readFileSync('src/components/admin/WhatsAppInbox.tsx', 'utf-8');

// The issue: selected is used before initialization.
// We need to move `const selected = conversations.find(c => c.id === selectedId) || null;` BEFORE the useEffect.

// First, find the loadMessages function block and the useEffect
// Then find the 'const selected =' definition.

code = code.replace(/useEffect\(\(\) => \{\n\s*if \(selectedId\) loadMessages\(selectedId\);\n\s*\}, \[selectedId, selected\?\.last_message_at\]\);\n\n  const selected = conversations\.find\(c => c\.id === selectedId\) \|\| null;/g,
`  const selected = conversations.find(c => c.id === selectedId) || null;

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
  }, [selectedId, selected?.last_message_at]);`);

// Just in case it was formatted slightly differently:
code = code.replace(/useEffect\(\(\) => \{\n\s*if \(selectedId\) loadMessages\(selectedId\);\n\s*\}, \[selectedId, selected\?\.last_message_at\]\);\n  const selected = conversations\.find\(c => c\.id === selectedId\) \|\| null;/g,
`  const selected = conversations.find(c => c.id === selectedId) || null;

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
  }, [selectedId, selected?.last_message_at]);`);

fs.writeFileSync('src/components/admin/WhatsAppInbox.tsx', code);
console.log("Fixed initialization order");
