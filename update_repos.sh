#!/bin/bash

DIR=$1

repos=(
    "api-usage"
    "cluster-manager"
    "file-manager"
    "inference-manager"
    "job-manager"
    "model-manager"
    "rbac-manager"
    "user-manager"
    "vector-store-manager"
)

needAction=()
for repo in ${repos[@]}; do
    echo "Updating $repo to latest ..."
    if [ ! -d "$DIR/$repo" ]; then
        cd $DIR
        git clone https://github.com/llmariner/$repo
	cd -
        continue
    fi
    git --git-dir "$DIR/$repo/.git" checkout main > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        needAction+=($repo)
        continue
    fi
    git --git-dir "$DIR/$repo/.git" pull origin main 
   
done

echo ""
if [ ${#needAction[@]} != 0 ]; then
    echo "Some repos cannot pull latest branch..."
    printf '* %s\n' "${needAction[@]}"
else
    echo "Repositories are at the latest version"
fi
