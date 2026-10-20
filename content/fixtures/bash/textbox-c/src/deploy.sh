#!/usr/bin/env bash
# Deploys a tagged release of the shop.
set -euo pipefail

tag="${1:?usage: deploy.sh TAG}"
deployer="$(id -un)"
echo "deploying $tag as $deployer"
# TODO: refuse to deploy when the working tree is dirty
git checkout --quiet "$tag"
