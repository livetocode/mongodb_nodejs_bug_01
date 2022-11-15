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
    echo "+-------------------------------------------------------------------------------------------------"
    echo "| Deploy Percona"
    echo "+-------------------------------------------------------------------------------------------------"
    # helm upgrade --install -n $NAMESPACE community-operator mongodb/community-operator
    kubectl apply -n $NAMESPACE -f https://raw.githubusercontent.com/percona/percona-server-mongodb-operator/v1.13.0/deploy/bundle.yaml

    helm upgrade --install -n $NAMESPACE mongo-cluster $CHARTS/mongo-cluster  --set fullnameOverride=$MONGO_NAME,replicaset.name=$MONGO_RS_NAME
    echo
fi

if [[ "$INSTALL_PROMETHEUS" == "true" ]]
then
    echo "+-------------------------------------------------------------------------------------------------"
    echo "| Deploy Prometheus"
    echo "+-------------------------------------------------------------------------------------------------"
    helm upgrade --install -n $NAMESPACE prom prometheus-community/prometheus --wait
    echo
fi

if [[ "$INSTALL_GRAFANA" == "true" ]]
then
    echo "+-------------------------------------------------------------------------------------------------"
    echo "| Deploy Grafana"
    echo "+-------------------------------------------------------------------------------------------------"
    helm upgrade --install -n $NAMESPACE graf grafana/grafana -f $ROOT_FOLDER/deployment/charts/grafana/values.yaml --wait
    echo
fi

if [[ "$INSTALL_MONGO_CHAOS" == "true" ]]
then
    echo "+-------------------------------------------------------------------------------------------------"
    echo "| Deploy Mongo Chaos"
    echo "+-------------------------------------------------------------------------------------------------"
    bash $ROOT_FOLDER/tools/mongo-chaos/scripts/deploy.sh
    echo
fi

echo "+-------------------------------------------------------------------------------------------------"
echo "| Pod status"
echo "+-------------------------------------------------------------------------------------------------"
kubectl get pods -n $NAMESPACE
