const { withAndroidProguardRules } = require('@expo/config-plugins');

module.exports = function withProguardRules(config) {
  return withAndroidProguardRules(config, (config) => {
    config.modResults.contents += `
# Fix Expo modules crash on Release (LazyKType NoClassDefFoundError)
-keep class expo.modules.kotlin.types.** { *; }
-keep class expo.modules.av.** { *; }
`;
    return config;
  });
};
