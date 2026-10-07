# Local development only. Community MinIO is archived; do not deploy this to production.
FROM golang:1.24.8-alpine AS build
RUN apk add --no-cache git
RUN git clone --depth 1 --branch RELEASE.2025-10-15T17-29-55Z https://github.com/minio/minio.git /src
WORKDIR /src
RUN CGO_ENABLED=0 go build -trimpath -o /out/minio .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates curl && adduser -D -u 10001 minio && mkdir /data && chown minio /data
COPY --from=build /out/minio /usr/local/bin/minio
COPY --from=build /src/LICENSE /licenses/MINIO-LICENSE
USER minio
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
