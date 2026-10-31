#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${JAVA_HOME:?Set JAVA_HOME to JDK 17 or newer}"
: "${ANDROID_HOME:?Set ANDROID_HOME to your Android SDK}"
BT="${BUILD_TOOLS_DIR:-$ANDROID_HOME/build-tools/34.0.0}"
ANDROID_JAR="${ANDROID_JAR:-$ANDROID_HOME/platforms/android-34/android.jar}"
export PATH="$JAVA_HOME/bin:$PATH"
for path in "$BT/aapt2" "$BT/d8" "$BT/apksigner" "$BT/zipalign" "$ANDROID_JAR"; do
  [[ -e "$path" ]] || { echo "Missing Android build dependency: $path" >&2; exit 1; }
done
OUT="$ROOT/build/android"
rm -rf "$OUT"
mkdir -p "$OUT"/{compiled,generated,classes,dex,assets/licenses} "$ROOT/release"
# Distribute third-party license notices inside the APK as well as in the repository.
cp -R "$ROOT/app/src/main/assets/." "$OUT/assets/"
cp "$ROOT/third_party/"*.txt "$ROOT/third_party/NOTICE.md" "$OUT/assets/licenses/"
"$BT/aapt2" compile --dir "$ROOT/app/src/main/res" -o "$OUT/compiled/resources.zip"
"$BT/aapt2" link -I "$ANDROID_JAR" --manifest "$ROOT/app/src/main/AndroidManifest.xml" \
  --java "$OUT/generated" --min-sdk-version 28 --target-sdk-version 34 \
  --version-code 3 --version-name 2.1.0 -A "$OUT/assets" \
  -o "$OUT/base.apk" "$OUT/compiled/resources.zip"
find "$ROOT/app/src/main/java" "$OUT/generated" -name '*.java' -print > "$OUT/sources.txt"
"$JAVA_HOME/bin/javac" -parameters -encoding UTF-8 -source 8 -target 8 -classpath "$ANDROID_JAR" -d "$OUT/classes" @"$OUT/sources.txt"
(cd "$OUT/classes" && "$JAVA_HOME/bin/jar" cf "$OUT/classes.jar" .)
"$BT/d8" --min-api 28 --lib "$ANDROID_JAR" --output "$OUT/dex" "$OUT/classes.jar"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && zip -q "$OUT/unsigned.apk" classes.dex)
"$BT/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
# Local debug key. Supply your own protected signing key for production releases.
KEYSTORE="${SIGNING_KEYSTORE:-$HOME/.android/midad-debug.keystore}"
ALIAS="${SIGNING_ALIAS:-midad-debug}"
STOREPASS="${SIGNING_STORE_PASSWORD:-android}"
KEYPASS="${SIGNING_KEY_PASSWORD:-$STOREPASS}"
if [[ ! -e "$KEYSTORE" ]]; then
  if [[ -n "${SIGNING_KEYSTORE:-}" ]]; then echo 'Configured signing keystore not found.' >&2; exit 1; fi
  mkdir -p "$(dirname "$KEYSTORE")"
  "$JAVA_HOME/bin/keytool" -genkeypair -keystore "$KEYSTORE" -alias "$ALIAS" \
    -storepass "$STOREPASS" -keypass "$KEYPASS" -keyalg RSA -keysize 2048 -validity 10000 \
    -dname 'CN=Midad Debug, OU=Development, O=Midad, C=US' >/dev/null 2>&1
fi
APK="$ROOT/release/Midad-2.0.0-local.apk"
"$BT/apksigner" sign --v4-signing-enabled false --ks "$KEYSTORE" --ks-key-alias "$ALIAS" --ks-pass "pass:$STOREPASS" \
  --key-pass "pass:$KEYPASS" --out "$APK" "$OUT/aligned.apk"
"$BT/apksigner" verify --verbose "$APK"
echo "APK: $APK"
