#!/bin/bash
set -e

SCRIPT_FOLDER="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_FOLDER="`cd "$SCRIPT_FOLDER/..";pwd`"

source $SCRIPT_FOLDER/../../../scripts/config.sh
source $SCRIPT_FOLDER/../../../scripts/utils.sh

for d in $PROJECT_FOLDER/mongodb-*/ ; do
    if [[ $d =~ ^.*/mongodb-(.+)/$ ]]
    then
        VERSION=${BASH_REMATCH[1]}
        buildExampleImage nodejs mongodb $VERSION $d/Dockerfile $PROJECT_FOLDER
    fi
done

