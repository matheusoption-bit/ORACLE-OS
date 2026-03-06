fetch('http://localhost:3001/api/task', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'crie um hello world em python', mode: 'Desenvolver app' })
}).then(res => res.json()).then(console.log).catch(console.error);
