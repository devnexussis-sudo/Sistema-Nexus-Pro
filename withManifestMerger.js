const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withManifestMerger(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;

    // Add tools namespace to root manifest if not exists
    if (!androidManifest.manifest.$['xmlns:tools']) {
      androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    // Add tools:replace="android:appComponentFactory" to application
    const application = androidManifest.manifest.application[0];
    const currentReplace = application.$['tools:replace'] || '';
    
    if (!currentReplace.includes('android:appComponentFactory')) {
      application.$['tools:replace'] = currentReplace 
        ? `${currentReplace},android:appComponentFactory`
        : 'android:appComponentFactory';
    }

    return config;
  });
};
