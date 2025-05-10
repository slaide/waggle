# build files (run this right before starting the server)

# ensure .ts files are compiled.
# nodejs install docs from https://help.pythonanywhere.com/pages/Node/

# ensure deps are installed
npm ci
# run typescript compiler
npm run build:ts