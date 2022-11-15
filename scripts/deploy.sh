#!/bin/bash
set -e

SCRIPT_FOLDER="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

source $SCRIPT_FOLDER/config.sh

bash $ROOT_FOLDER/examples/nodejs/scripts/deploy.sh
bash $ROOT_FOLDER/examples/python/scripts/deploy.sh

echo
echo "+-------------------------------------------------------------------------------------------------"
echo "| Pod status"
echo "+-------------------------------------------------------------------------------------------------"
kubectl get pods -n $NAMESPACE
