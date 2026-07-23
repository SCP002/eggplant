#!/bin/bash

DOCKER_CIDR="172.16.0.0/12"
DISPATCHER="/etc/NetworkManager/dispatcher.d/99-docker-bypass-tun"

sudo tee "$DISPATCHER" > /dev/null << ENDSEQ
#!/bin/bash
INTERFACE=\$1
STATUS=\$2

if [ "\$STATUS" = "up" ]; then
    /usr/bin/ip rule del from $DOCKER_CIDR table main pref 100 2>/dev/null
    /usr/bin/ip rule add from $DOCKER_CIDR table main pref 100
fi
ENDSEQ

sudo chown root:root "$DISPATCHER"
sudo chmod 755 "$DISPATCHER"

sudo ip rule del from "$DOCKER_CIDR" table main pref 100 2>/dev/null || true
sudo ip rule add from "$DOCKER_CIDR" table main pref 100
