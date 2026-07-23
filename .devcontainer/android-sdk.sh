#!/bin/bash
set -e

SDKMANAGER="${ANDROID_HOME}/cmdline-tools/latest/bin/sdkmanager"

if [ -x "$SDKMANAGER" ]; then
    echo "Android SDK already installed, updating licenses and packages..."
    yes | "$SDKMANAGER" --licenses > /dev/null 2>&1
    "$SDKMANAGER" "platforms;android-36" "platforms;android-34" "build-tools;36.0.0" "platform-tools" > /dev/null 2>&1 || true
else
    echo "Installing Android SDK..."
    mkdir -p "$ANDROID_HOME/cmdline-tools"
    curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o /tmp/cmdline-tools.zip
    unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-tools
    mv /tmp/cmdline-tools/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"
    rm -rf /tmp/cmdline-tools /tmp/cmdline-tools.zip
    yes | "$SDKMANAGER" --licenses > /dev/null 2>&1
    "$SDKMANAGER" "platforms;android-36" "platforms;android-34" "build-tools;36.0.0" "platform-tools" > /dev/null 2>&1
fi
