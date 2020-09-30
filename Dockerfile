FROM node:10.16-alpine

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install some build dependecies
RUN apk add --no-cache --repository http://dl-cdn.alpinelinux.org/alpine/v3.6/main \
            --repository  http://dl-cdn.alpinelinux.org/alpine/v3.6/community \
            libc6-compat git tar bzip2 make g++ && npm install --production && apk del tar make g++

# copy the compiled sources
COPY ./dist /usr/src/app/dist
COPY ./node_modules /usr/src/app/node_modules

EXPOSE 56874
CMD [ "node", "dist" ]
