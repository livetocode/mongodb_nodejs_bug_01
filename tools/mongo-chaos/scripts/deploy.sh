#!/bin/bash
set -e

SCRIPT_FOLDER="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

source $SCRIPT_FOLDER/../../../scripts/config.sh

# ensure that the k8s namespace already exists
kubectl create ns $NAMESPACE || true

NAME="mongo-chaos"

helm upgrade --install $NAME \
    $CHARTS/mongo-chaos \
    -n $NAMESPACE \
    --set fullnameOverride=$NAME \
    --wait
