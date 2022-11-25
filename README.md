# Bug report

## Title

Occasional loss of connectivity with a replicaset of 3 nodes, after a primary node change

## Details

In some rare cases, the MongoDB driver for NodeJS is not able to "survive" a change of the primary node, in the MongoDB cluster.

The following test cases will demonstrate the issue but you might have to run it for hours before it gets triggered!

Apparently, after a topology change of type ReplicaSetNoPrimary, the driver would not trigger a ReplicaSetWithPrimary and thus would miss the currently active primary node and the MongoDB queries would fails with the following errors:
- Server selection timed out after ...
- not primary and secondaryOk=false

This is a regression introduced in version 4.7 of the NodeJS MongoDB driver.

### Fix

The MongoDB team acknowledged this issue by releasing the new [4.12.0](https://github.com/mongodb/node-mongodb-native/releases/tag/v4.12.0) version, which contains the following statement:

Version 4.7.0 of the Node driver released an improvement to our server monitoring in FAAS environments by allowing the driver to skip monitoring events if there were more than one monitoring events in the queue when the monitoring code restarted. When skipping monitoring events that contained a topology change, the driver would incorrectly fail to update its view of the topology.

Version 4.12.0 fixes this issue by ensuring that the topology is always updated when monitoring events are processed.


## Test

We made a test suite to demonstrate the issues.

We deploy a MongoDB cluster configured as a Replicaset of 3 nodes, using the Percona operator for Kubernetes.

Then we run a chaos script that will change the version of the cluster every 10 minutes, in order to force a change of the primary node while upgrading the nodes.

In parallel, we run several tests cases that will issue 2 queries per second to the server.
We have a test case for each version of the MongoDB driver that we want to study, and we test both NodeJS and Python in order to demonstrate that this is not a bug related to MongoDB but to specific versions of its NodeJS drivers.

Finally, there is a Grafana dashboard to observe the results in live and compare the performance of those test cases.

### Requirements

#### Tools

Run the following bash script to verify that the required tools are properly installed:

`bash scripts/check-prerequisites.sh`

#### Cluster

You need a kubernetes cluster with at least 3 nodes and for each node 8 GB of Ram and 2 vCPUs.

You can provision such a cluster in GCP with GKE, or any other cloud provider.

You could also run your own cluster on your machine as long as you have 3 nodes (see k3d/k3s for instance).

Make sure the current configuration for the kubectl command points to the right cluster.

### Configuration

You can edit the file scripts/config.sh to adjust some options. 

### Provisioning

Run the following script in order to provision the required services, such as MongoDB, Prometheus and Grafana:

`bash scripts/provision.sh`

### Deployment

Run the following script in order to deploy the different test cases in the cluster:

`bash scripts/deploy.sh`

### Dashboard

You can observe the results in live using the provided Grafana dashboard.
Just run this script and it will open a tunnel to the Grafana app and open it in your browser.
The username is 'admin' and the password is also 'admin'.

`bash scripts/open-dashboard.sh`

## Build

If you want to rebuild the images, you can change the DOCKER_ORG variable in the scripts/config.sh file to use your own account.

Then just run this script:

`bash scripts/build.sh`

Note that this script will build the images using two platforms (Arm64 and Amd64), to support both Apple M1 chips and regular AMD chips.

If you don't want Arm64, edit the scripts/utils.sh file (and the buildExampleImage function).
There is another build script to update in tools/mongo-chaos/scripts/build.sh

## Run locally

If you want to test or debug an example, then cd to the right folder, install the dependencies and run it.

Also, make sure that you define the MONGO_URL environment variable to point to your MongoDB cluster. Your connection string should specify the replicaset nodes, the DB name and the user credentials.

For example, for running mongodb-4.7.0:
```shell
cd examples/nodejs/mongodb-4.7.0
npm install
export MONGO_URL=...
npm start
```
