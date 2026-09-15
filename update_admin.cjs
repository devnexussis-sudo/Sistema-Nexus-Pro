const fs = require('fs');
let code = fs.readFileSync('supabase/functions/whatsapp-admin-send/index.ts', 'utf8');

// Replace standard inserts with history update
// There are multiple blocks that do:
// await supabaseAdmin.from("whatsapp_messages").insert({ ... })
// await supabaseAdmin.from("whatsapp_conversations").update({ last_message_at: ... })
// We'll replace the update block to include history.

// Block 1: start_conversation
code = code.replace(
  /await supabaseAdmin\s*\.from\("whatsapp_conversations"\)\s*\.update\(\{\s*state: "HUMAN_ACTIVE",\s*assigned_agent_id: user\.id,\s*customer_id: customer_id \|\| existingConv\.customer_id,\s*last_message_at: new Date\(\)\.toISOString\(\),\s*\}\)/g,
  `await supabaseAdmin
          .from("whatsapp_conversations")
          .update({
            state: "HUMAN_ACTIVE",
            assigned_agent_id: user.id,
            customer_id: customer_id || existingConv.customer_id,
            history: [...(existingConv.history || []), { role: "agent", content: initial_message.trim().substring(0, 2000), timestamp: new Date().toISOString() }],
            last_message_at: new Date().toISOString(),
          })`
);

// Block 2: create new conv
code = code.replace(
  /last_message_at: new Date\(\)\.toISOString\(\),\s*\}\]\)/,
  `last_message_at: new Date().toISOString(),
            history: initial_message && initial_message.trim() ? [{ role: "agent", content: initial_message.trim().substring(0, 2000), timestamp: new Date().toISOString() }] : [],
          }])`
);

// Block 3: takeover
code = code.replace(
  /await supabaseAdmin\s*\.from\("whatsapp_conversations"\)\s*\.update\(\{\s*state: "HUMAN_ACTIVE",\s*assigned_agent_id: user\.id,\s*last_message_at: new Date\(\)\.toISOString\(\),\s*\}\)/g,
  `await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          state: "HUMAN_ACTIVE",
          assigned_agent_id: user.id,
          history: [...(conv.history || []), { role: "agent", content: takeoverMsg, timestamp: new Date().toISOString() }],
          last_message_at: new Date().toISOString(),
        })`
);

// Block 4: return_to_bot
code = code.replace(
  /await supabaseAdmin\s*\.from\("whatsapp_conversations"\)\s*\.update\(\{\s*state: "CUSTOMER_FOUND",\s*assigned_agent_id: null,\s*last_message_at: new Date\(\)\.toISOString\(\),\s*\}\)/,
  `await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          state: "CUSTOMER_FOUND",
          assigned_agent_id: null,
          history: [...(conv.history || []), { role: "bot", content: returnMsg, timestamp: new Date().toISOString() }],
          last_message_at: new Date().toISOString(),
        })`
);

// Block 5: transfer
code = code.replace(
  /await supabaseAdmin\s*\.from\("whatsapp_conversations"\)\s*\.update\(\{\s*assigned_agent_id: extra\.target_user_id,\s*last_message_at: new Date\(\)\.toISOString\(\),\s*\}\)/,
  `await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          assigned_agent_id: extra.target_user_id,
          history: [...(conv.history || []), { role: "agent", content: transferMsg, timestamp: new Date().toISOString() }],
          last_message_at: new Date().toISOString(),
        })`
);

// Block 6: close_conversation
code = code.replace(
  /await supabaseAdmin\s*\.from\("whatsapp_conversations"\)\s*\.update\(\{\s*state: "GREETING",\s*assigned_agent_id: null,\s*last_message_at: new Date\(\)\.toISOString\(\),\s*\}\)/,
  `await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          state: "GREETING",
          assigned_agent_id: null,
          history: [...(conv.history || []), { role: "agent", content: closeMsg, timestamp: new Date().toISOString() }],
          last_message_at: new Date().toISOString(),
        })`
);

// Block 7: send
code = code.replace(
  /const safeText = message\.substring\(0, 2000\);\s*await supabaseAdmin\.from\("whatsapp_messages"\)\.insert\(\{[\s\S]*?\}\);\s*await supabaseAdmin\s*\.from\("whatsapp_conversations"\)\s*\.update\(\{ last_message_at: new Date\(\)\.toISOString\(\) \}\)\s*\.eq\("id", conversation_id\);/,
  `const safeText = message.substring(0, 2000);

      await supabaseAdmin.from("whatsapp_messages").insert({
        conversation_id: conversation_id,
        tenant_id: conv.tenant_id,
        role: "agent",
        content: safeText,
        type: "text",
        is_from_me: true,
        agent_id: user.id,
        agent_name: extra?.agent_name || "Agente",
        created_at: new Date().toISOString()
      });

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({ 
            history: [...(conv.history || []), { role: "agent", content: safeText, timestamp: new Date().toISOString() }],
            last_message_at: new Date().toISOString() 
        })
        .eq("id", conversation_id);`
);

// Block 8: send_media
code = code.replace(
  /const safeText = \`MEDIA_URL:\$\{media_type\}:\$\{message\}\`;\s*await supabaseAdmin\.from\("whatsapp_messages"\)\.insert\(\{[\s\S]*?\}\);\s*await supabaseAdmin\s*\.from\("whatsapp_conversations"\)\s*\.update\(\{ last_message_at: new Date\(\)\.toISOString\(\) \}\)\s*\.eq\("id", conversation_id\);/,
  `const safeText = \`MEDIA_URL:\${media_type}:\${message}\`;

      await supabaseAdmin.from("whatsapp_messages").insert({
        conversation_id: conversation_id,
        tenant_id: conv.tenant_id,
        role: "agent",
        content: safeText,
        type: media_type || "document",
        media_url: message, // public R2 url
        is_from_me: true,
        agent_id: user.id,
        agent_name: extra?.agent_name || "Agente",
        created_at: new Date().toISOString()
      });

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({ 
            history: [...(conv.history || []), { role: "agent", content: safeText, timestamp: new Date().toISOString() }],
            last_message_at: new Date().toISOString() 
        })
        .eq("id", conversation_id);`
);

// Block 9: send_sticker
code = code.replace(
  /const safeText = "\[✨ Figurinha Enviada\]";\s*await supabaseAdmin\.from\("whatsapp_messages"\)\.insert\(\{[\s\S]*?\}\);\s*await supabaseAdmin\s*\.from\("whatsapp_conversations"\)\s*\.update\(\{ last_message_at: new Date\(\)\.toISOString\(\) \}\)\s*\.eq\("id", conversation_id\);/,
  `const safeText = "[✨ Figurinha Enviada]";

      await supabaseAdmin.from("whatsapp_messages").insert({
        conversation_id: conversation_id,
        tenant_id: conv.tenant_id,
        role: "agent",
        content: safeText,
        type: "sticker",
        media_url: message, // sticker url
        is_from_me: true,
        agent_id: user.id,
        agent_name: extra?.agent_name || "Agente",
        created_at: new Date().toISOString()
      });

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({ 
            history: [...(conv.history || []), { role: "agent", content: safeText, timestamp: new Date().toISOString() }],
            last_message_at: new Date().toISOString() 
        })
        .eq("id", conversation_id);`
);

fs.writeFileSync('supabase/functions/whatsapp-admin-send/index.ts', code);
console.log('Admin send fixed');
