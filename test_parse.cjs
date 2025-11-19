const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
let parsed = null;

rl.on('line', (line) => {
  try {
    const event = JSON.parse(line);
    console.error('Event type:', event.type);
    if (event.type === 'item.completed' && event.item) {
      console.error('Item type:', event.item.type);
      if (event.item.type === 'agent_message') {
        console.error('Found agent_message, text:', event.item.text.substring(0, 50));
        parsed = JSON.parse(event.item.text);
        console.log('SUCCESS! Parsed:', JSON.stringify(parsed, null, 2));
      }
    }
  } catch (e) {
    console.error('Parse error:', e.message);
  }
});

rl.on('close', () => {
  if (!parsed) {
    console.log('FAILED: No agent_message found or parsing failed');
  }
});
