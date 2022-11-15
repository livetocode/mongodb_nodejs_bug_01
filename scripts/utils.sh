#!/bin/bash
set -e

UTILS_SCRIPT_FOLDER="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

source $UTILS_SCRIPT_FOLDER/config.sh

# $1 = runtime
# $2 = driver
# $3 = driverVersion
function deployMongoClientHelmChart {
    RUNTIME=$1
    DRIVER=$2
    DRIVER_VERSION=$3

    echo "+-------------------------------------------------------------------------------------------------"
    echo "| Deploy Helm chart for $RUNTIME/$DRIVER-$DRIVER_VERSION"
    echo "+-------------------------------------------------------------------------------------------------"

    # ensure that the k8s namespace already exists
    kubectl create ns $NAMESPACE || true

    generateMongoValues

    # Generate a name without dots or Kubernetes will reject it
    V=${DRIVER_VERSION//[.]/}
    NAME="$DOCKER_REPO_PREFIX-$RUNTIME-$DRIVER-$V"

    helm upgrade --install $NAME \
        $CHARTS/mongo-client \
        -n $NAMESPACE \
        --set image.repository=$DOCKER_ORG/$DOCKER_REPO_PREFIX \
        --set image.runtime=$RUNTIME \
        --set image.driver=$DRIVER \
        --set image.tag=$DRIVER_VERSION \
        --set fullnameOverride=$NAME \
        --set logs.verbose=$VERBOSE \
        -f $TEMP_FOLDER/mongo-values.yaml
    echo
}

function generateMongoValues {
    # generate MongoDB connection string
    MONGO_HOST="$(kubectl get perconaservermongodb -n $NAMESPACE $MONGO_NAME -o  jsonpath='{.status.host}')"
    MONGO_USER="$(kubectl get secret -n $NAMESPACE $MONGO_NAME-secrets -o  jsonpath='{.data.MONGODB_DATABASE_ADMIN_USER}' | base64 -d)"
    MONGO_PWD="$(kubectl get secret -n $NAMESPACE $MONGO_NAME-secrets -o  jsonpath='{.data.MONGODB_DATABASE_ADMIN_PASSWORD}' | base64 -d)"
    MONGO_NODE1="$MONGO_NAME-$MONGO_RS_NAME-0.$MONGO_HOST:$MONGO_PORT"
    MONGO_NODE2="$MONGO_NAME-$MONGO_RS_NAME-1.$MONGO_HOST:$MONGO_PORT"
    MONGO_NODE3="$MONGO_NAME-$MONGO_RS_NAME-2.$MONGO_HOST:$MONGO_PORT"
    mkdir -p $TEMP_FOLDER
    cat > $TEMP_FOLDER/mongo-values.yaml <<EOF
mongo:
  url: "mongodb://$MONGO_USER:$MONGO_PWD@$MONGO_NODE1,$MONGO_NODE2,$MONGO_NODE2/$MONGO_DB_NAME?replicaSet=$MONGO_RS_NAME&authSource=$MONGO_AUTH_SOURCE"
EOF
}

# $1 = runtime
# $2 = driver
# $3 = driverVersion
# $4 = docker file path
# $5 = docker context folder
function buildExampleImage {
    RUNTIME=$1
    DRIVER=$2
    DRIVER_VERSION=$3
    DOCKER_FILE=$4
    DOCKER_CONTEXT=$5

    echo "+-------------------------------------------------------------------------------------------------"
    echo "| Building Docker image for $RUNTIME/$DRIVER-$DRIVER_VERSION"
    echo "+-------------------------------------------------------------------------------------------------"
    docker buildx build --platform linux/amd64,linux/arm64 --pull --push -t $DOCKER_ORG/$DOCKER_REPO_PREFIX-$RUNTIME-$DRIVER:$DRIVER_VERSION -f $DOCKER_FILE $DOCKER_CONTEXT
    echo
}