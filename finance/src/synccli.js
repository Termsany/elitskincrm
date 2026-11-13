// مزامنة يدوية من سطر الأوامر:  npm run sync
require('dotenv').config();
const store = require('./store');
const { runSync } = require('./sync');
store.load();
runSync().then(r => {
  console.log(r.ok ? ('تمت المزامنة: ' + JSON.stringify(r.counts)) : ('فشل: ' + r.error));
  process.exit(r.ok ? 0 : 1);
});
