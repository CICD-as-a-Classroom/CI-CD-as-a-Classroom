#!/bin/bash

token="github_pa"
token+="t_"
token+="11AINDF5Y0mtIaO1OpgPAs_6QKAg"
token+="a2FFXUsXv8ARf2H7W6AP61R9C4LQfakeGRU8dKZI2YYG6ZHDAd8DTB"

run_result="$(curl -X 'POST' -H 'Accept: application/vnd.github+json' -H "Authorization: Bearer $token" -H 'X-GitHub-Api-Version: 2026-03-10' -d '{"ref": "main", "inputs": {"authCode": "1234", "pkceCodeVerifier": "1234", "authTokenRSAEncryptionKey": "1234"}}' "https://api.github.com/repos/CICD-as-a-Classroom/CI-CD-as-a-Classroom/actions/workflows/gen-user-auth-token-github.yml/dispatches")"


echo

run_url="$(echo "$run_result" | jq '.run_url' -r)"

for i in $(seq 10)
do
	query_result="$(curl -X 'GET' -H 'Accept: application/vnd.github+json' -H "Authorization: Bearer $token" -H 'X-GitHub-Api-Version: 2026-03-10' "$run_url")"
	echo "Query $i:"
	echo "$query_result" | jq '.status,.conclusion'
	echo
	sleep 1
done
