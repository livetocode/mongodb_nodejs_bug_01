#!/bin/bash
set -e

SCRIPT_FOLDER="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

source $SCRIPT_FOLDER/config.sh

helm repo add mongodb https://mongodb.github.io/helm-charts
# helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# ensure that the k8s namespace already exists
kubectl create ns $NAMESPACE || true

if [[ "$INSTALL_PERCONA" == "true" ]]
then
    # helm upgrade --install -n $NAMESPACE community-operator mongodb/community-operator
    kubectl apply -n $NAMESPACE -f https://raw.githubusercontent.com/percona/percona-server-mongodb-operator/v1.13.0/deploy/bundle.yaml

    helm upgrade --install -n $NAMESPACE mongo-cluster $CHARTS/mongo-cluster  --set fullnameOverride=$MONGO_NAME,replicaset.name=$MONGO_RS_NAME
fi

if [[ "$INSTALL_PROMETHEUS" == "true" ]]
then
    helm upgrade --install -n $NAMESPACE prom prometheus-community/prometheus
fi

if [[ "$INSTALL_GRAFANA" == "true" ]]
then
    helm upgrade --install -n $NAMESPACE graf grafana/grafana -f $ROOT_FOLDER/deployment/charts/grafana/values.yaml
fi

if [[ "$INSTALL_MONGO_CHAOS" == "true" ]]
then
    pushd $SCRIPT_FOLDER/../tools/mongo-chaos
    bash ./scripts/deploy.sh
    popd
fi
