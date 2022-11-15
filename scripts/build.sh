#!/bin/bash
set -e

SCRIPT_FOLDER="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

source $SCRIPT_FOLDER/config.sh

bash $ROOT_FOLDER/examples/nodejs/scripts/build.sh

bash $ROOT_FOLDER/examples/python/scripts/build.sh

bash $ROOT_FOLDER/tools/mongo-chaos/scripts/build.sh
