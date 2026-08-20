const fs = require('fs');
const path = require('path');

const nodeModulesDir = path.join(__dirname, '..', 'node_modules');

function optimizeExpoModules() {
  if (!fs.existsSync(nodeModulesDir)) return;
  const packages = fs.readdirSync(nodeModulesDir);
  
  for (const pkg of packages) {
    if (pkg.startsWith('.')) continue;
    
    // Handle scoped packages like @expo
    if (pkg.startsWith('@')) {
      const scopeDir = path.join(nodeModulesDir, pkg);
      if (fs.statSync(scopeDir).isDirectory()) {
        const scopedPkgs = fs.readdirSync(scopeDir);
        for (const scopedPkg of scopedPkgs) {
          processModule(path.join(scopeDir, scopedPkg));
        }
      }
    } else {
      processModule(path.join(nodeModulesDir, pkg));
    }
  }
}

function processModule(moduleDir) {
  if (!fs.existsSync(moduleDir) || !fs.statSync(moduleDir).isDirectory()) return;

  const mavenRepo = path.join(moduleDir, 'local-maven-repo');
  if (fs.existsSync(mavenRepo)) {
    fs.rmSync(mavenRepo, { recursive: true, force: true });
    console.log('Deleted ' + mavenRepo);
  }

  const configFile = path.join(moduleDir, 'expo-module.config.json');
  if (fs.existsSync(configFile)) {
    try {
      const content = fs.readFileSync(configFile, 'utf8');
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
        fs.writeFileSync(configFile, JSON.stringify(json, null, 2));
        console.log('Patched ' + configFile);
      }
    } catch (e) {
      // ignore
    }
  }
}

console.log('Forcing Expo modules to build from source...');
optimizeExpoModules();
console.log('Done!');
