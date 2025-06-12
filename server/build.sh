# build files (run this right before starting the server)

# ensure .ts files are compiled.
# nodejs install docs from https://help.pythonanywhere.com/pages/Node/

# ensure deps are installed
bun install
# run typescript compiler and bundler
bun run bundle
