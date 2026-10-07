#!/bin/zsh
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
STUDIO_PROJECT="${0:A:h}"
if ! cd "$STUDIO_PROJECT"; then
  print '\nStudion kansiota ei löydy. Käynnistys ei onnistunut.'
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  print '\nStudion käynnistysohjelmaa ei löydy tältä Macilta.'
  STUDIO_RESULT=1
else
  node "$STUDIO_PROJECT/tools/studio-launch.mjs" "$@"
  STUDIO_RESULT=$?
fi
if [[ -t 0 && "$1" != '--check' ]]; then
  read -k 1 '?Sulje ikkuna painamalla mitä tahansa näppäintä.'
  print
fi
exit "$STUDIO_RESULT"
