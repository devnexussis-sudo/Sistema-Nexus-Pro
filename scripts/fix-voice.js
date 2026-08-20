const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../node_modules/@react-native-voice/voice/android/build.gradle');
if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/jcenter\(\)/g, 'mavenCentral()');
    content = content.replace(/compileSdkVersion rootProject/g, 'compileSdk rootProject');
    content = content.replace(/com\.android\.support:appcompat-v7:\$\{supportVersion\}/g, 'androidx.appcompat:appcompat:1.2.0');
    fs.writeFileSync(file, content);
    console.log('[fix-voice] Patched @react-native-voice/voice android build.gradle');
} else {
    console.warn('[fix-voice] File not found:', file);
}
