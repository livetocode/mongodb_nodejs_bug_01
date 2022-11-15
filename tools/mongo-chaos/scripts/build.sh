#!/bin/bash
set -e

SCRIPT_FOLDER="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_FOLDER="`cd "$SCRIPT_FOLDER/..";pwd`"

source $SCRIPT_FOLDER/../../../scripts/config.sh

echo "+-------------------------------------------------------------------------------------------------"
echo "| Building Docker image for mongo-chaos"
echo "+-------------------------------------------------------------------------------------------------"
VERSION=1.0
docker buildx build --platform linux/amd64,linux/arm64 --pull --push -t $DOCKER_ORG/mongo-chaos:$VERSION -f $PROJECT_FOLDER/Dockerfile $PROJECT_FOLDER
