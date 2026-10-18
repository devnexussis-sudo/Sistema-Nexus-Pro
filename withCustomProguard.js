const { withDangerousMod, withGradleProperties, withAppBuildGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function setGradleProperty(properties, key, value) {
  const existingIndex = properties.findIndex(
    (item) => item.type === 'property' && item.key === key
  );
  if (existingIndex !== -1) {
    properties[existingIndex].value = value;
  } else {
    properties.push({ type: 'property', key, value });
  }
}

module.exports = function withProguardRules(config) {
  // 1. Ensure gradle.properties has enough Heap & Metaspace and only builds physical device ABIs
  config = withGradleProperties(config, (config) => {
    setGradleProperty(
      config.modResults,
      'org.gradle.jvmargs',
      '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8'
    );
    setGradleProperty(
      config.modResults,
      'reactNativeArchitectures',
      'armeabi-v7a,arm64-v8a'
    );
    setGradleProperty(
      config.modResults,
      'expo.useLegacyPackaging',
      'true'
    );
    setGradleProperty(
      config.modResults,
      'org.gradle.workers.max',
      '2'
    );
    return config;
  });

  // 2. Disable lintVitalAnalyzeRelease during release APK assembly (prevents Metaspace OOM right before packageRelease)
  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy' && !config.modResults.contents.includes('checkReleaseBuilds false')) {
      config.modResults.contents = config.modResults.contents.replace(
        /android\s*\{/,
        `android {\n    lint {\n        checkReleaseBuilds false\n        abortOnError false\n    }`
      );
    }
    return config;
  });

  // 3. Keep Expo Kotlin types & metadata in Proguard
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const proguardPath = path.join(config.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const rules = `
# Fix Expo modules crash on Release (LazyKType NoClassDefFoundError)
-keep class expo.modules.kotlin.types.** { *; }
-keep interface expo.modules.kotlin.types.** { *; }
-keep class kotlin.Metadata { *; }
-keep class kotlin.reflect.** { *; }
-keep class kotlin.coroutines.** { *; }
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

