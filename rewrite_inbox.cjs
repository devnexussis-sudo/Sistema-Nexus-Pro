const fs = require('fs');
let code = fs.readFileSync('src/components/admin/WhatsAppInbox.tsx', 'utf-8');

// 1. Update Message interface
code = code.replace(/interface Message \{[\s\S]*?\}/, `interface Message {
  id?: string;
  role: 'bot' | 'user' | 'agent' | 'system';
  content: string;
  timestamp?: string; // legacy
  created_at?: string;
  agent_id?: string;
  type?: string;
  media_url?: string;
  agent_name?: string;
  is_from_me?: boolean;
}`);

// 2. Add new states inside WhatsAppInbox component
if (!code.includes('const [chatMessages, setChatMessages]')) {
    code = code.replace(/const \[conversations, setConversations\] = useState<Conversation\[\]>\(\[\]\);/, 
    `const [conversations, setConversations] = useState<Conversation[]>([]);\n  const [chatMessages, setChatMessages] = useState<Record<string, Message[]>>({});`);
}

// 3. Remove 'history' from select in fetchConversations
code = code.replace(/\.select\('\*, customers\(name, document\), users\(name\)'\)/g, `.select('id, phone_number, state, last_message_at, customer_id, assigned_agent_id, customers(name, document), users(name)')`);

// 4. Inject load messages function and useEffect inside WhatsAppInbox
const loadMessagesFn = `
  const loadMessages = async (convId: string) => {
    if (!convId) return;
    setIsLoadingHistory(prev => ({...prev, [convId]: true}));
    const { data } = await supabase.from('whatsapp_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(100); // For now limit 100
    if (data) {
      setChatMessages(prev => ({...prev, [convId]: data as any}));
    }
    setIsLoadingHistory(prev => ({...prev, [convId]: false}));
  };

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
  }, [selectedId]);
`;
if (!code.includes('const loadMessages = async')) {
    code = code.replace(/const selected = conversations\.find/, loadMessagesFn + '\n  const selected = conversations.find');
}

// 5. Replace references to selected.history to use chatMessages[selected.id]
code = code.replace(/selected\.history/g, '(chatMessages[selected.id] || [])');
code = code.replace(/selected\?.history/g, '(chatMessages[selected.id] || [])');

// 6. Optimistic UI updates
code = code.replace(/history: \[\.\.\.\(c\.history\|\|\[\]\), optimisticMsg\]/g, '/* history removed */');
code = code.replace(/history: \(c\.history \|\| \[\]\)\.filter\(m => m !== optimisticMsg\)/g, '/* history removed */');
code = code.replace(/history: mergedHistory/g, '/* history removed */');

// Add optimistic message to chatMessages instead
code = code.replace(/setConversations\(prev => prev\.map\(c => c\.id === selected\.id \? \{ \.\.\.c, state: 'HUMAN_ACTIVE', assigned_agent_id: currentUserId, \/\* history removed \*\/ \} : c\)\);/g, `
    setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, state: 'HUMAN_ACTIVE', assigned_agent_id: currentUserId } : c));
    setChatMessages(prev => ({ ...prev, [selected.id]: [...(prev[selected.id] || []), optimisticMsg as any] }));
`);

// The same for CUSTOMER_FOUND
code = code.replace(/setConversations\(prev => prev\.map\(c => c\.id === selected\.id \? \{ \.\.\.c, state: 'CUSTOMER_FOUND', assigned_agent_id: null, \/\* history removed \*\/ \} : c\)\);/g, `
    setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, state: 'CUSTOMER_FOUND', assigned_agent_id: null } : c));
    setChatMessages(prev => ({ ...prev, [selected.id]: [...(prev[selected.id] || []), optimisticMsg as any] }));
`);

// The same for RESOLVED
code = code.replace(/setConversations\(prev => prev\.map\(c => c\.id === selected\.id \? \{ \.\.\.c, state: 'RESOLVED', assigned_agent_id: null, \/\* history removed \*\/ \} : c\)\);/g, `
    setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, state: 'RESOLVED', assigned_agent_id: null } : c));
    setChatMessages(prev => ({ ...prev, [selected.id]: [...(prev[selected.id] || []), optimisticMsg as any] }));
`);

// The same for targetUserId
code = code.replace(/setConversations\(prev => prev\.map\(c => c\.id === selected\.id \? \{ \.\.\.c, assigned_agent_id: targetUserId, \/\* history removed \*\/ \} : c\)\);/g, `
    setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, assigned_agent_id: targetUserId } : c));
    setChatMessages(prev => ({ ...prev, [selected.id]: [...(prev[selected.id] || []), optimisticMsg as any] }));
`);

// 7. Render history mapping
code = code.replace(/combinedHistory\.map\(\(msg, i\) => {/g, `chatMessages[selected.id]?.map((msg, i) => {`);

// 8. timestamp fallback
code = code.replace(/new Date\(msg\.timestamp\)/g, `new Date(msg.created_at || msg.timestamp || new Date())`);
code = code.replace(/const timeString = formatTime\(msg\.timestamp\)/g, `const timeString = formatTime(msg.created_at || msg.timestamp || new Date().toISOString())`);

fs.writeFileSync('src/components/admin/WhatsAppInbox.tsx', code);
console.log("Refactored WhatsAppInbox.tsx");
