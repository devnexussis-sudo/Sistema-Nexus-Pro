const fs = require('fs');
let code = fs.readFileSync('supabase/functions/whatsapp-bot/index.ts', 'utf8');

// Fix 1: HUMAN_ACTIVE block
code = code.replace(
  /let insertType = 'text';\s*if \(humanVisibleText\.startsWith\('MEDIA_URL:'\)\) \{\s*insertType = humanVisibleText\.split\(':'\)\[1\] \|\| 'text';\s*\}/,
  `let insertType = 'text';
      if (humanVisibleText.startsWith('MEDIA_URL:')) {
          insertType = humanVisibleText.split(':')[1] || 'text';
      }

      let updatedHistory = [
        ...(Array.isArray(conversation.history) ? conversation.history : []),
        { role: "user", content: humanVisibleText, timestamp: new Date().toISOString() },
      ];
      if (updatedHistory.length > 100) updatedHistory = updatedHistory.slice(-100);`
);

code = code.replace(
  /await supabase\s*\.from\("whatsapp_conversations"\)\s*\.update\(\{ last_message_at: new Date\(\)\.toISOString\(\) \}\)\s*\.eq\("id", conversation\.id\);/,
  `await supabase
        .from("whatsapp_conversations")
        .update({ history: updatedHistory, last_message_at: new Date().toISOString() })
        .eq("id", conversation.id);`
);

// Fix 2: AI Reply block
code = code.replace(
  /let userMsgType = 'text';\s*if \(safeText\.startsWith\('MEDIA_URL:'\)\) \{\s*userMsgType = safeText\.split\(':'\)\[1\] \|\| 'text';\s*\}/,
  `let userMsgType = 'text';
    if (safeText.startsWith('MEDIA_URL:')) {
        userMsgType = safeText.split(':')[1] || 'text';
    }

    let updatedHistory = [
      ...(Array.isArray(conversation.history) ? conversation.history : []),
      { role: "user", content: safeText, timestamp: new Date().toISOString() },
      { role: "bot", content: safeReply, timestamp: new Date().toISOString() },
    ];
    if (updatedHistory.length > 100) updatedHistory = updatedHistory.slice(-100);`
);

code = code.replace(
  /await supabase\.from\("whatsapp_conversations"\)\.update\(\{\s*state: new_state \|\| conversation\.state,\s*customer_id: customer_id \|\| conversation\.customer_id,\s*last_message_at: new Date\(\)\.toISOString\(\),\s*\}\)\.eq\("id", conversation\.id\);/,
  `await supabase.from("whatsapp_conversations").update({
      state: new_state || conversation.state,
      history: updatedHistory,
      customer_id: customer_id || conversation.customer_id,
      last_message_at: new Date().toISOString(),
    }).eq("id", conversation.id);`
);

fs.writeFileSync('supabase/functions/whatsapp-bot/index.ts', code);
console.log('Bot history fixed');
