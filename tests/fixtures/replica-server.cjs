for (const name of ['kkphimService', 'vicdnService', 'personService', 'tmdbService']) {
  const id = require.resolve(`../../src/services/${name}`);
  require.cache[id] = { id, filename: id, loaded: true, exports: name === 'vicdnService' ? { hasBilingualMatch: () => false } : {} };
}
const { start } = require('../../src/server');
start().then(async server => {
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  process.send?.({ port: server.address().port });
}).catch(() => { console.error('Replica fixture failed startup'); process.exit(1); });
process.on('message', message => { if (message === 'stop') process.emit('SIGTERM'); });
