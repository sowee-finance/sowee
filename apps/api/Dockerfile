# The Go API: quotes, KYC, the x402 gate and the HCS anchor.
FROM golang:1.25-alpine AS build
WORKDIR /src
# Dependencies first, so a code change does not re-download the module graph.
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

FROM alpine:3.22
# The API talks to Hedera, the facilitator and Sumsub over TLS.
RUN apk add --no-cache ca-certificates && adduser -D -u 10001 api
USER api
COPY --from=build /out/api /usr/local/bin/api
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["api"]
