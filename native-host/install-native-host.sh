#!/usr/bin/env bash
# ==============================================================================
# install-native-host.sh
# Installs the Native Messaging Host for FZL Emacs Buku in Chromium, Chrome,
# Brave, and Firefox.
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_SCRIPT="${SCRIPT_DIR}/fzl_buku_native_host.py"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Ensure host script is executable
chmod +x "${HOST_SCRIPT}"

# Extension IDs
CHROMIUM_EXT_ID="ckmmhjhihijcbgiibcnmieooofnibjeg"
FIREFOX_EXT_ID="fzl-emacs-buku@fzl.desktop"

# Allow custom Chromium extension ID as $1 if provided
if [ -n "$1" ]; then
    EXTRA_EXT_ID="$1"
    echo "Adding extra Chromium extension ID: ${EXTRA_EXT_ID}"
fi

echo "=========================================================="
echo "Installing FZL Emacs Buku Native Messaging Host"
echo "Host script: ${HOST_SCRIPT}"
echo "=========================================================="

# Create temporary manifests
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

CHROME_MANIFEST="${TMP_DIR}/fzl_emacs_buku_chrome.json"
FIREFOX_MANIFEST="${TMP_DIR}/fzl_emacs_buku_firefox.json"

# Chromium / Chrome / Brave manifest
cat <<EOF > "${CHROME_MANIFEST}"
{
  "name": "fzl_emacs_buku",
  "description": "FZL Emacs Buku Native Messaging Host",
  "path": "${HOST_SCRIPT}",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${CHROMIUM_EXT_ID}/"$([ -n "${EXTRA_EXT_ID}" ] && echo ",\n    \"chrome-extension://${EXTRA_EXT_ID}/\"")
  ]
}
EOF

# Firefox manifest
cat <<EOF > "${FIREFOX_MANIFEST}"
{
  "name": "fzl_emacs_buku",
  "description": "FZL Emacs Buku Native Messaging Host",
  "path": "${HOST_SCRIPT}",
  "type": "stdio",
  "allowed_extensions": [
    "${FIREFOX_EXT_ID}"
  ]
}
EOF

# Target directories
DIRS_CHROME=(
    "${HOME}/.config/chromium/NativeMessagingHosts"
    "${HOME}/.config/google-chrome/NativeMessagingHosts"
    "${HOME}/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
    "${HOME}/.config/microsoft-edge/NativeMessagingHosts"
)

DIR_FIREFOX="${HOME}/.mozilla/native-messaging-hosts"

# Install Chromium/Chrome/Brave manifests
for d in "${DIRS_CHROME[@]}"; do
    mkdir -p "$d"
    cp "${CHROME_MANIFEST}" "$d/fzl_emacs_buku.json"
    chmod 644 "$d/fzl_emacs_buku.json"
    echo "✓ Installed Chromium manifest to: $d/fzl_emacs_buku.json"
done

# Install Firefox manifest
mkdir -p "${DIR_FIREFOX}"
cp "${FIREFOX_MANIFEST}" "${DIR_FIREFOX}/fzl_emacs_buku.json"
chmod 644 "${DIR_FIREFOX}/fzl_emacs_buku.json"
echo "✓ Installed Firefox manifest to: ${DIR_FIREFOX}/fzl_emacs_buku.json"

# Run host self-test
echo ""
echo "Running self-test on ${HOST_SCRIPT}..."
python3 "${HOST_SCRIPT}" --test

echo ""
echo "=========================================================="
echo "Native Messaging Host installed successfully!"
echo "Chromium extension ID: ${CHROMIUM_EXT_ID}"
echo "Firefox extension ID:  ${FIREFOX_EXT_ID}"
echo "=========================================================="
