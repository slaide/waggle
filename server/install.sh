# https://help.pythonanywhere.com/pages/ASGICommandLine

# setup the page. (this only ever need to be run once, and does NOT actually deploy the page)

# make pa command available
pip install --upgrade pythonanywhere

cd /home/padraig
mkvirtualenv waggleenv --python=python3.12

# ensure venv is activated
workon waggleenv
pip install -r requirements.txt

# setup ssl (https)
pa website create-autorenew-cert --domain padraig.eu.pythonanywhere.com

# install bun
curl -fsSL https://bun.sh/install | bash
