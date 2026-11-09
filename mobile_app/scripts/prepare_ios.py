import os
import re
import shutil

def update_ios_target():
    # 1. Update project.pbxproj deployment target to 14.0
    pbxproj = "ios/Runner.xcodeproj/project.pbxproj"
    if os.path.exists(pbxproj):
        with open(pbxproj, "r", encoding="utf-8") as f:
            content = f.read()
        new_content = re.sub(
            r"IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+;",
            "IPHONEOS_DEPLOYMENT_TARGET = 14.0;",
            content,
        )
        with open(pbxproj, "w", encoding="utf-8") as f:
            f.write(new_content)
        print("Updated project.pbxproj deployment target to 14.0")

    # 2. Update Podfile deployment target to 14.0
    podfile = "ios/Podfile"
    if os.path.exists(podfile):
        with open(podfile, "r", encoding="utf-8") as f:
            content = f.read()
        new_content = re.sub(
            r"#?\s*platform :ios,\s*['\"][0-9.]+['\"]",
            "platform :ios, '14.0'",
            content,
        )
        if "platform :ios" not in new_content:
            new_content = "platform :ios, '14.0'\n" + new_content
        with open(podfile, "w", encoding="utf-8") as f:
            f.write(new_content)
        print("Updated Podfile deployment target to 14.0")

    # 3. Copy CineViet AppIcon assets to iOS Assets.xcassets
    icon_src = "config/ios/AppIcon.appiconset"
    icon_dst = "ios/Runner/Assets.xcassets/AppIcon.appiconset"
    if os.path.exists(icon_src):
        os.makedirs(icon_dst, exist_ok=True)
        for item in os.listdir(icon_src):
            s = os.path.join(icon_src, item)
            d = os.path.join(icon_dst, item)
            if os.path.isfile(s):
                shutil.copy2(s, d)
        print("Copied CineViet AppIcon to ios/Runner/Assets.xcassets/AppIcon.appiconset")

if __name__ == "__main__":
    update_ios_target()
