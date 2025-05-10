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

# install npm (from https://help.pythonanywhere.com/pages/Node/)
git clone --depth 1 https://github.com/creationix/nvm.git
source ~/nvm/nvm.sh
echo 'source ~/nvm/nvm.sh' >> ~/.bashrc
nvm install v23.11.0
