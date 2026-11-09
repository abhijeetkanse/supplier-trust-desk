// Copies the UI files into the App Router's "resources" folder, which xs-app.json serves (localDir).
// Run before the MTA build (mta.yaml runs it): node scripts/copy-ui.js
const fs = require('fs'), path = require('path')
const root = path.resolve(__dirname, '..'), app = path.join(root, 'app')
const out = path.join(root, '.deploy', 'app-router', 'resources')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
for (const file of ['index.html', 'logged-out.html']) fs.copyFileSync(path.join(app, file), path.join(out, file))
fs.cpSync(path.join(app, 'report'), path.join(out, 'report'), { recursive: true })
for (const name of fs.readdirSync(app)) {
  const webapp = path.join(app, name, 'webapp')
  if (fs.existsSync(webapp)) fs.cpSync(webapp, path.join(out, name, 'webapp'), { recursive: true })
}
console.log('UI copied to', path.relative(root, out), '->', fs.readdirSync(out).join(', '))
