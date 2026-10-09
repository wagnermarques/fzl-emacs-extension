#!/usr/bin/env bash
# ==============================================================================
# build.sh - Build, Test, and Packaging script for FZL Emacs Buku Extension
# Supports Chromium (Chrome/Brave/Edge) and Mozilla Firefox
# ==============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="${PROJECT_DIR}/dist"

cd "${PROJECT_DIR}"

echo "=========================================================="
echo "FZL Emacs Buku Bookmarks - Build & Packaging"
echo "Project directory: ${PROJECT_DIR}"
echo "=========================================================="

cmd_test() {
    echo ">> Running backend test suite..."
    python3 "${PROJECT_DIR}/tests/test_extension_backend.py"
    echo ">> Self-testing native messaging host..."
    python3 "${PROJECT_DIR}/native-host/fzl_buku_native_host.py" --test
    echo "✓ All tests passed!"
}

cmd_package() {
    cmd_test
    mkdir -p "${DIST_DIR}"

    echo ""
    echo ">> Packaging Chromium extension..."
    CHROMIUM_ZIP="${DIST_DIR}/fzl-emacs-buku-chromium.zip"
    rm -f "${CHROMIUM_ZIP}"

    TMP_CHROME="$(mktemp -d)"
    cp -r icons background popup options README.md "${TMP_CHROME}/"
    cp manifest.chromium.json "${TMP_CHROME}/manifest.json"
    (cd "${TMP_CHROME}" && zip -rq "${CHROMIUM_ZIP}" .)
    rm -rf "${TMP_CHROME}"
    echo "✓ Chromium package created: ${CHROMIUM_ZIP}"

    echo ""
    echo ">> Packaging Firefox extension..."
    FIREFOX_ZIP="${DIST_DIR}/fzl-emacs-buku-firefox.zip"
    rm -f "${FIREFOX_ZIP}"

    TMP_FF="$(mktemp -d)"
    cp -r icons background popup options README.md "${TMP_FF}/"
    cp manifest.firefox.json "${TMP_FF}/manifest.json"
    (cd "${TMP_FF}" && zip -rq "${FIREFOX_ZIP}" .)
    rm -rf "${TMP_FF}"
    echo "✓ Firefox package created:  ${FIREFOX_ZIP}"

    echo ""
    echo "=========================================================="
    echo "Packages created in dist/:"
    ls -lh "${DIST_DIR}"/*.zip
    echo "=========================================================="
}

cmd_install_host() {
    echo ">> Installing Native Messaging Host manifests..."
    "${PROJECT_DIR}/native-host/install-native-host.sh" "$1"
}

cmd_switch_chromium() {
    cp "${PROJECT_DIR}/manifest.chromium.json" "${PROJECT_DIR}/manifest.json"
    echo "✓ Active manifest switched to Chromium mode."
}

cmd_switch_firefox() {
    cp "${PROJECT_DIR}/manifest.firefox.json" "${PROJECT_DIR}/manifest.json"
    echo "✓ Active manifest switched to Firefox mode."
}

case "$1" in
    test)
        cmd_test
        ;;
    package|build)
        cmd_package
        ;;
    install-host)
        cmd_install_host "$2"
        ;;
    switch-chromium)
        cmd_switch_chromium
        ;;
    switch-firefox)
        cmd_switch_firefox
        ;;
    *)
        echo "Usage: ./build.sh {test|package|install-host|switch-chromium|switch-firefox}"
        echo ""
        echo "Commands:"
        echo "  test              Run full integration test suite"
        echo "  package           Run tests and build .zip bundles for Chromium and Firefox"
        echo "  install-host      Register Native Messaging manifests in local browsers"
        echo "  switch-chromium   Set manifest.json for Chromium unpacked loading"
        echo "  switch-firefox    Set manifest.json for Firefox temporary addon loading"
        exit 1
        ;;
esac
