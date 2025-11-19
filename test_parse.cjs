const fs = require('fs');
const input = fs.readFileSync(0, 'utf-8');

const lines = input.trim().split('\n');
let parsed = null;

for (const line of lines) {
  try {
    const event = JSON.parse(line);
    if (event.type === 'item.completed' && event.item) {
      if (event.item.type === 'agent_message') {
        console.log('Found agent_message, text:', event.item.text);
        try {
          parsed = JSON.parse(event.item.text);
          console.log('SUCCESS! Parsed:', JSON.stringify(parsed, null, 2));
        } catch (parseErr) {
          console.log('Parse error:', parseErr.message);
        }
      }
    }
  } catch (err) {
    console.log('Line parse error:', err.message);
  }
}

if (!parsed) {
  console.log('No valid agent_message found');
  process.exit(1);
}
