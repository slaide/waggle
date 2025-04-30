# https://help.pythonanywhere.com/pages/ASGICommandLine

# deplay the page

# create website with command to run server
pa website create --domain padraig.eu.pythonanywhere.com --command '/home/padraig/.virtualenvs/waggleenv/bin/python -m uvicorn --app-dir /home/padraig/waggle --uds ${DOMAIN_SOCKET} server:app'

# list websites
pa website get

# get info
pa website get --domain padraig.eu.pythonanywhere.com
