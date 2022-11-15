#!/bin/bash

# set -o xtrace
set -e

VERSIONS=('5.0.2-1' '5.0.3-2' '5.0.4-3' '5.0.5-4' '5.0.6-5' '5.0.7-6' '5.0.8-7' '5.0.9-8' '5.0.10-9' '5.0.11-10' '5.0.13-11')

upgrade_versions()
{
    echo "-------------------------------------------------------------"
    echo "[`date`] start new set of mongo upgrades"
    for VERSION in "${VERSIONS[@]}"
    do
        echo "[`date`] Trying mongo version $VERSION"
        kubectl patch psmdb my-cluster-name --type='json' -p="[{\"op\": \"replace\", \"path\": \"/spec/image\", \"value\":\"percona/percona-server-mongodb:$VERSION\"}]"
        sleep 600
    done
    echo "[`date`] done with set of mongo upgrades"
    echo ""
}

echo "start infinite loop of mongo upgrades"

for (( ; ; ))
do
    upgrade_versions
done


