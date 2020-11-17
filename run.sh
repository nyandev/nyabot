#!/bin/sh

pkill -u "$USER" node
node built/index.js -c config.json