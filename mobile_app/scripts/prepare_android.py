import os
import re


SIGNING_BLOCK_GROOVY = """    signingConfigs {
        release {
            storeFile file("debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }
"""

SIGNING_BLOCK_KTS = """    signingConfigs {
        create("release") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }
"""


def update_android_project():
    gradle_path = "android/app/build.gradle"
    is_kts = False
    if not os.path.exists(gradle_path):
        gradle_path = "android/app/build.gradle.kts"
        is_kts = True

    if not os.path.exists(gradle_path):
        raise FileNotFoundError("Could not find android/app/build.gradle or build.gradle.kts")

    if not os.path.exists("android/app/debug.keystore"):
        raise FileNotFoundError("Missing android/app/debug.keystore for consistent APK signing")

    with open(gradle_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Keep SDK levels compatible with pinned plugin versions
    content = content.replace("flutter.compileSdkVersion", "34")
    content = content.replace("flutter.minSdkVersion", "21")
    content = content.replace("flutter.targetSdkVersion", "34")
    content = content.replace("JavaVersion.VERSION_1_8", "JavaVersion.VERSION_17")
    content = content.replace("jvmTarget = '1.8'", "jvmTarget = '17'")
    content = content.replace('jvmTarget = "1.8"', 'jvmTarget = "17"')
    content = re.sub(
        r"JavaLanguageVersion\.of\(\s*8\s*\)",
        "JavaLanguageVersion.of(17)",
        content,
    )

    if "multiDexEnabled" not in content:
        content = re.sub(
            r"(targetSdk\s*=?\s*34)",
            r"\1\n        multiDexEnabled = true",
            content,
            count=1,
        )

    # Inject explicit release signingConfigs pointing to the repo's persistent debug.keystore
    # instead of relying on AGP's ephemeral ~/.android/debug.keystore on CI runners.
    if not re.search(r"\bsigningConfigs\s*\{", content):
        block = SIGNING_BLOCK_KTS if is_kts else SIGNING_BLOCK_GROOVY
        new_content, count = re.subn(
            r"(\n\s*buildTypes\s*\{)",
            "\n" + block + r"\1",
            content,
            count=1,
        )
        if count != 1:
            raise RuntimeError(f"Failed to insert signingConfigs into {gradle_path}")
        content = new_content
    elif "signingConfigs.release" not in content and not re.search(r'\brelease\s*\{[^}]*storeFile', content):
        inner = (
            '        create("release") {\n'
            '            storeFile = file("debug.keystore")\n'
            '            storePassword = "android"\n'
            '            keyAlias = "androiddebugkey"\n'
            '            keyPassword = "android"\n'
            '        }\n'
            if is_kts else
            '        release {\n'
            '            storeFile file("debug.keystore")\n'
            '            storePassword "android"\n'
            '            keyAlias "androiddebugkey"\n'
            '            keyPassword "android"\n'
            '        }\n'
        )
        content = re.sub(r"(\bsigningConfigs\s*\{)", r"\1\n" + inner, content, count=1)

    if is_kts:
        content, sig_count = re.subn(
            r'signingConfig\s*=\s*signingConfigs\.getByName\("debug"\)',
            'signingConfig = signingConfigs.getByName("release")',
            content,
        )
    else:
        content, sig_count = re.subn(
            r"signingConfig\s*(?:=\s*)?signingConfigs\.debug",
            "signingConfig = signingConfigs.release",
            content,
        )

    if sig_count == 0 and "signingConfigs.release" not in content and 'getByName("release")' not in content:
        raise RuntimeError(f"Failed to bind buildTypes.release to release signingConfig in {gradle_path}")

    assert re.search(r"\bsigningConfigs\s*\{", content), "Missing signingConfigs block"
    assert "debug.keystore" in content, "Missing debug.keystore reference"

    with open(gradle_path, "w", encoding="utf-8") as f:
        f.write(content)

    # Upgrade Kotlin Gradle Plugin version in settings.gradle for wakelock_plus compatibility
    for settings_path in ("android/settings.gradle", "android/settings.gradle.kts"):
        if os.path.exists(settings_path):
            with open(settings_path, "r", encoding="utf-8") as f:
                s_content = f.read()
            s_new = re.sub(
                r'id\s*\(?\s*["\']org\.jetbrains\.kotlin\.android["\']\s*\)?\s*version\s*["\'][^"\']+["\']',
                'id "org.jetbrains.kotlin.android" version "1.9.24"',
                s_content,
            )
            if settings_path.endswith(".kts"):
                s_new = s_new.replace(
                    'id "org.jetbrains.kotlin.android" version "1.9.24"',
                    'id("org.jetbrains.kotlin.android") version "1.9.24"',
                )
            with open(settings_path, "w", encoding="utf-8") as f:
                f.write(s_new)

    print(f"Configured {gradle_path} with persistent release signing and SDK settings")


if __name__ == "__main__":
    update_android_project()
