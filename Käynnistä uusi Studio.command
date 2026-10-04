#!/bin/zsh
STUDIO_PROJECT="${0:A:h}"
cd "$STUDIO_PROJECT"
node tools/studio-host.mjs start
read -k 1 '?Sulje ikkuna painamalla mitä tahansa näppäintä.'
