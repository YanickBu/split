const fs = require('fs');
eval(fs.readFileSync('js/state.js', 'utf8'));

State.createGroup('Test New Group', 'USD', 'Alice');
const group = Object.values(State.data.groups)[0];
console.log(group.events);
