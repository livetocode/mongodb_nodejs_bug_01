#!/bin/bash
set -e

SCRIPT_FOLDER="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

source $SCRIPT_FOLDER/config.sh


POD_NAME=$(kubectl get pods --namespace $NAMESPACE -l "app.kubernetes.io/name=grafana,app.kubernetes.io/instance=graf" -o jsonpath="{.items[0].metadata.name}")

(echo && \
    echo "Waiting 5 secs before opening the dashboard, while establishing the port-forward tunnel" && \
    echo && \
    sleep 5 && \
    open http://localhost:3000/d/OjVAKqSVz/mongodb-client-tests?orgId=1&from=now-3h&to=now) &

kubectl --namespace $NAMESPACE port-forward $POD_NAME 3000
