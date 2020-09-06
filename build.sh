#! /bin/bash
$(aws ecr get-login --no-include-email --region ca-central-1) && \
docker build . -t sensor-config-backend:latest -t 744227544587.dkr.ecr.ca-central-1.amazonaws.com/sensor-config-backend:latest