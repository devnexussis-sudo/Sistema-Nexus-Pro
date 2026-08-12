const payload = {
  data: {
    messages: [
      {
        message: {
          ephemeralMessage: {
            message: {
              extendedTextMessage: {
                text: "Hello from brother"
              }
            }
          }
        }
      }
    ]
  }
};

function extractText(payload) {
  const msgObj = payload.data?.messages?.[0] || payload.data;
  const content = payload.content || 
                  payload.message?.content ||
                  payload.text?.message || 
                  payload.body || 
                  msgObj?.message?.conversation ||
                  msgObj?.message?.extendedTextMessage?.text;

  if (typeof content === 'string') return content;
  if (typeof content === 'object' && content !== null) {
    return content.caption || null;
  }
  return null;
}

console.log("Text:", extractText(payload));
