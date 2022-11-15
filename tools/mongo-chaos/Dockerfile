FROM alpine/k8s:1.25.2

WORKDIR /mtl/app

COPY upgrade-mongo-version.sh /mtl/app
RUN chmod +x upgrade-mongo-version.sh

ENTRYPOINT "/mtl/app/upgrade-mongo-version.sh"
