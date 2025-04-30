import sys

# add your project directory to the sys.path
project_home = '/home/padraig/waggle'
if project_home not in sys.path:
    sys.path = [project_home] + sys.path

# name "application" is mandatory
from server import application
