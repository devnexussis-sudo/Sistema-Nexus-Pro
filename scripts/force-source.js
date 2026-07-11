const fs = require('fs');
const path = require('path');

const nodeModulesDir = path.join(__dirname, '..', 'node_modules');

function traverse(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file === 'local-maven-repo') {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log('Deleted ' + fullPath);
      } else {
        traverse(fullPath);
      }
    } else if (file === 'expo-module.config.json') {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const json = JSON.parse(content);
        let changed = false;
        if (json.android && json.android.publication) {
          delete json.android.publication;
          changed = true;
        }
        if (json.ios && json.ios.publication) {
          delete json.ios.publication;
          changed = true;
        }
        if (changed) {
          fs.writeFileSync(fullPath, JSON.stringify(json, null, 2));
          console.log('Patched ' + fullPath);
        }
      } catch (e) {
        // ignore
      }
    }
  }
}

console.log('Forcing Expo modules to build from source...');
traverse(nodeModulesDir);
console.log('Done!');
