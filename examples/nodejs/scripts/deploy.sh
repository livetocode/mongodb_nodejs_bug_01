#!/bin/bash
set -e

SCRIPT_FOLDER="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

source $SCRIPT_FOLDER/../../../scripts/config.sh
source $SCRIPT_FOLDER/../../../scripts/utils.sh

for d in $SCRIPT_FOLDER/../mongodb-*/ ; do
    if [[ $d =~ ^.*/mongodb-(.+)/$ ]]
    then
        VERSION="${BASH_REMATCH[1]}"
        deployMongoClientHelmChart "nodejs" "mongodb" $VERSION
    fi
done
