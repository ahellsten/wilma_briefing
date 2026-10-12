FROM node:22-alpine
RUN apk add --no-cache jq curl bash \
 && npm i -g @wilm-ai/wilma-cli
COPY run.sh /run.sh
RUN chmod +x /run.sh
CMD ["/run.sh"]
