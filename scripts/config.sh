export VERBOSE=false
export ROOT_SCRIPT_FOLDER="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
export ROOT_FOLDER="`cd "$ROOT_SCRIPT_FOLDER/..";pwd`"
export TEMP_FOLDER=$ROOT_SCRIPT_FOLDER/../temp
export CHARTS="$ROOT_FOLDER/deployment/charts"

export DOCKER_ORG=livetocode
export DOCKER_REPO_PREFIX=mongo-client

export NAMESPACE=infra-mongo-test

export INSTALL_PROMETHEUS=true
export INSTALL_GRAFANA=true
export INSTALL_PERCONA=true
export INSTALL_MONGO_CHAOS=true


export MONGO_NAME="my-cluster-name"
export MONGO_PORT="27017"
export MONGO_DB_NAME="foobar"
export MONGO_RS_NAME="rs0"
export MONGO_AUTH_SOURCE="admin"
