#!/bin/env bash

set -euo pipefail

REPOS=(agrisat-agent agrisat-api agrisat-web)

for repo in "${REPOS[@]}"
do
    docker build -t "fahminlb33/$repo:latest" "src/$repo"
    docker push "fahminlb33/$repo:latest"
done
