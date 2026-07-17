#!/bin/bash

run_result="$(curl -X 'POST' -H 'Accept: application/vnd.github+json' -H 'Authorization: Bearer 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' -H 'X-GitHub-Api-Version: 2026-03-10' -d '{"ref": "main", "inputs": {"authCode": "1234", "pkceCodeVerifier": "1234", "authTokenRSAEncryptionKey": "1234"}}' "https://api.github.com/repos/CICD-as-a-Classroom/CI-CD-as-a-Classroom/actions/workflows/gen-user-auth-token-github.yml/dispatches")"

echo

run_url="$(echo "$run_result" | jq '.run_url' -r)"

for i in $(seq 10)
do
	query_result="$(curl -X 'GET' -H 'Accept: application/vnd.github+json' -H 'Authorization: Bearer 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' -H 'X-GitHub-Api-Version: 2026-03-10' "$run_url")"
	echo "Query $i:"
	echo "$query_result" | jq '.status,.conclusion'
	echo
	sleep 1
done
