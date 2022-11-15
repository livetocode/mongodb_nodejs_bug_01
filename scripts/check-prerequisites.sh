if ! command -v kubectl &> /dev/null
then
    echo "[ERROR] You must install Kubernetes commandline tool (kubectl). See https://kubernetes.io/docs/tasks/tools/"
    exit 1
fi

if ! command -v helm &> /dev/null
then
    echo "[ERROR] You must install Helm commandline tool (helm). See https://helm.sh/docs/intro/install/"
    exit 1
fi

if ! command -v docker &> /dev/null
then
    echo "[WARNING] You should install Docker commandline tool (docker) but only if you need to build the examples. See https://docs.docker.com/get-docker/"
fi

echo "[SUCCESS] All prerequisites are satisfied"
