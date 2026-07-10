const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withProguardRules(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const proguardPath = path.join(config.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const rules = `
# Fix Expo modules crash on Release (LazyKType NoClassDefFoundError)
-keep class expo.modules.kotlin.types.** { *; }
-keep interface expo.modules.kotlin.types.** { *; }
-keep class expo.modules.av.** { *; }
-keep interface expo.modules.av.** { *; }
`;
      if (fs.existsSync(proguardPath)) {
        let content = fs.readFileSync(proguardPath, 'utf-8');
        if (!content.includes('expo.modules.kotlin.types')) {
          fs.writeFileSync(proguardPath, content + rules);
        }
      } else {
        fs.writeFileSync(proguardPath, rules);
      }
      return config;
    },
  ]);
};
