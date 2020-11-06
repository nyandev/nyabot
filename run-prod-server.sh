#!/bin/sh

pkill -u "$USER" node
node built/index.js -c config.json >/dev/null 2>&1 &