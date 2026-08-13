#!/bin/bash

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)

source "$script_dir/.env"

if [[ "$DEPLOYED_WEB_REPO_DIR" != "" ]]
then
	read -p "About to reset contents of $DEPLOYED_WEB_REPO_DIR. Press enter to continue, or CTRL+C to cancel."
	
	mkdir -p "$DEPLOYED_WEB_REPO_DIR"
	tmp_dir="/tmp/classroom-dev-tools/"
	rm -rf "$tmp_dir"
	mkdir -p "$tmp_dir"
	mv "$DEPLOYED_WEB_REPO_DIR/.git" "$tmp_dir"
	find "$DEPLOYED_WEB_REPO_DIR" -mindepth 1 -delete
	mv "$tmp_dir/.git" "$DEPLOYED_WEB_REPO_DIR"

	cp -a "$script_dir/../web/". "$DEPLOYED_WEB_REPO_DIR"
	(
		cd "$DEPLOYED_WEB_REPO_DIR"
		git add -A
		git commit -m "Update"
		git push
	)
else
	echo "DEPLOYED_WEB_REPO_DIR not defined in .env. Skipping."
fi

if [[ "$DEPLOYED_BACKEND_WORKFLOWS_REPO_DIR" != "" ]]
then
	read -p "About to reset contents of $DEPLOYED_BACKEND_WORKFLOWS_REPO_DIR. Press enter to continue, or CTRL+C to cancel."
	
	mkdir -p "$DEPLOYED_BACKEND_WORKFLOWS_REPO_DIR"
	tmp_dir="/tmp/classroom-dev-tools/"
	rm -rf "$tmp_dir"
	mkdir -p "$tmp_dir"
	mv "$DEPLOYED_BACKEND_WORKFLOWS_REPO_DIR/.git" "$tmp_dir"
	find "$DEPLOYED_BACKEND_WORKFLOWS_REPO_DIR" -mindepth 1 -delete
	mv "$tmp_dir/.git" "$DEPLOYED_BACKEND_WORKFLOWS_REPO_DIR"

	cp -a "$script_dir/../backend-workflows"/. "$DEPLOYED_BACKEND_WORKFLOWS_REPO_DIR"
	(
		cd "$DEPLOYED_BACKEND_WORKFLOWS_REPO_DIR"
		git add -A
		git commit -m "Update"
		git push
	)
else
	echo "DEPLOYED_BACKEND_WORKFLOWS_REPO_DIR not defined in .env. Skipping."
fi

if [[ "$DEPLOYED_ASSIGNMENT_TEMPLATES_REPO_DIR" != "" ]]
then
	read -p "About to reset contents of $DEPLOYED_ASSIGNMENT_TEMPLATES_REPO_DIR. Press enter to continue, or CTRL+C to cancel."
	
	mkdir -p "$DEPLOYED_ASSIGNMENT_TEMPLATES_REPO_DIR"
	tmp_dir="/tmp/classroom-dev-tools/"
	rm -rf "$tmp_dir"
	mkdir -p "$tmp_dir"
	mv "$DEPLOYED_ASSIGNMENT_TEMPLATES_REPO_DIR/.git" "$tmp_dir"
	find "$DEPLOYED_ASSIGNMENT_TEMPLATES_REPO_DIR" -mindepth 1 -delete
	mv "$tmp_dir/.git" "$DEPLOYED_ASSIGNMENT_TEMPLATES_REPO_DIR"

	cp -a "$script_dir/../assignment-templates"/. "$DEPLOYED_ASSIGNMENT_TEMPLATES_REPO_DIR"
	(
		cd "$DEPLOYED_ASSIGNMENT_TEMPLATES_REPO_DIR"
		git add -A
		git commit -m "Update"
		git push
	)
else
	echo "DEPLOYED_ASSIGNMENT_TEMPLATES_REPO_DIR not defined in .env. Skipping."
fi
