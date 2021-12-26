FROM node:14-buster

WORKDIR /app

ADD .yarn /app/.yarn
ADD package.json yarn.lock .pnp.cjs .yarnrc.yml /app

RUN yarn

ADD jest.config.ts tsconfig.json babel.config.js /app

VOLUME /app/test
VOLUME /app/.git
VOLUME /app/bundles

CMD yarn jest
