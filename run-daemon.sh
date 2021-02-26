#!/bin/sh

cd "$(dirname "$0")"

pkill -u "$USER" node
npm start -- -c config.json >> nyabot.log 2>&1 &
