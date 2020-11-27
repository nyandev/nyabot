#!/bin/sh

cd "$(dirname "$0")"

pkill -u "$USER" node
node built/index.js -c config.json >> nyabot.log 2>&1 &
