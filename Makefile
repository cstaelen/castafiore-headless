IMAGE := cstaelen/castafiore-headless
VERSION ?= latest

.PHONY: build push push-rpi build-multiarch setup-buildx run logs devices

setup-buildx:
	docker buildx create --use

build:
	docker build -t $(IMAGE):$(VERSION) .

build-multiarch:
	docker buildx build --no-cache --platform linux/amd64,linux/arm64 -t $(IMAGE):$(VERSION) .

push:
	docker buildx build --no-cache --platform linux/amd64,linux/arm64 -t $(IMAGE):$(VERSION) --push .

push-rpi:
	docker buildx build --no-cache --platform linux/arm64 -t $(IMAGE):$(VERSION) --push .

run:
	docker run --rm -p 8899:8899 \
		$(if $(wildcard /dev/snd),--device /dev/snd,) \
		-e ALSA_DEVICE="plughw:0,0" \
		$(IMAGE):$(VERSION)

logs:
	docker logs -f $$(docker ps -qf "ancestor=$(IMAGE):$(VERSION)")

devices:
	docker run --rm --device /dev/snd $(IMAGE):$(VERSION) aplay -l
