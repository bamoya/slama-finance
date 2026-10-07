#!/usr/bin/env bash
# Run as root after the official installer. Keep root SSH disabled.
set -euo pipefail
key=${1:?Pass the existing Coolify automation key path}
case "$key" in
  /data/coolify/ssh/keys/*) ;;
  *) printf 'Expected a Coolify automation key path\n' >&2; exit 1 ;;
esac
test -f "$key"
if ! id cooluser >/dev/null 2>&1; then
  useradd --create-home --user-group --shell /bin/bash --password NP cooluser
fi
install -d -m 700 -o cooluser -g cooluser /home/cooluser/.ssh
public_key=$(ssh-keygen -y -f "$key")
touch /home/cooluser/.ssh/authorized_keys
if ! grep -qF "$public_key" /home/cooluser/.ssh/authorized_keys; then
  printf '%s\n' "$public_key" >> /home/cooluser/.ssh/authorized_keys
fi
chown cooluser:cooluser /home/cooluser/.ssh/authorized_keys
chmod 600 /home/cooluser/.ssh/authorized_keys
printf 'cooluser ALL=(ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/cooluser
chmod 440 /etc/sudoers.d/cooluser
visudo -cf /etc/sudoers.d/cooluser
su - cooluser -c 'sudo -n true'
# The container runs as UID 9999. Shared group access preserves container access
# while allowing the dedicated deployment user to manage host directories.
chgrp -R cooluser /data/coolify
chmod -R g+rwX /data/coolify
chmod -R o-rwx /data/coolify
# OpenSSH refuses private keys with group permissions, even for a trusted group.
find /data/coolify/ssh/keys -type f -exec chmod 600 {} +
