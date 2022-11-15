FROM node:lts-alpine

USER node

WORKDIR /mtl/app

COPY --chown=node mongodb-3.7.3 /mtl/app

COPY --chown=node shared /mtl/shared

RUN  npm install --no-cache

EXPOSE 3000 5858

CMD ["node", "index.js"]
