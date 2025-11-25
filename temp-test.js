const params = JSON.parse('{\"__proto__\": {\"polluted\": true}}');
const sanitized = { ...params };
console.log('sanitized own polluted:', sanitized.hasOwnProperty('polluted'));
console.log('polluted on sanitized?', 'polluted' in sanitized);
console.log('global polluted?', {}.polluted);
