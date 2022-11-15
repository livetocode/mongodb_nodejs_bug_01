#!/bin/bash
set -e

SCRIPT_FOLDER="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_FOLDER="`cd "$SCRIPT_FOLDER/..";pwd`"

source $SCRIPT_FOLDER/../../../scripts/config.sh
source $SCRIPT_FOLDER/../../../scripts/utils.sh

for d in $PROJECT_FOLDER/pymongo-*/ ; do
    if [[ $d =~ ^.*/pymongo-(.+)/$ ]]
    then
        VERSION=${BASH_REMATCH[1]}
        buildExampleImage python pymongo $VERSION $d/Dockerfile $d
    fi
done

