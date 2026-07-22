#!/bin/bash

token="github_pa"
token+="t_"
token+="11AINDF5Y0mtIaO1OpgPAs_6QKAg"
token+="a2FFXUsXv8ARf2H7W6AP61R9C4LQfakeGRU8dKZI2YYG6ZHDAd8DTB"

run_result="$(curl -X 'POST' -H 'Accept: application/vnd.github+json' -H "Authorization: Bearer $token" -H 'X-GitHub-Api-Version: 2026-03-10' -d '{"ref": "main", "inputs": {"authCode": "1234", "pkceCodeVerifier": "1234", "resultEncryptionKey": "1234"}}' "https://api.github.com/repos/CICD-as-a-Classroom/CI-CD-as-a-Classroom/actions/workflows/gen-user-auth-token-github.yml/dispatches")"

run_url="$(echo "$run_result" | jq '.run_url' -r)"

sleep 3
for i in $(seq 10)
do
	query_result="$(curl -X 'GET' -H 'Accept: application/vnd.github+json' -H "Authorization: Bearer $token" -H 'X-GitHub-Api-Version: 2026-03-10' "$run_url")"
	echo "Query $i:"
	echo "$query_result" | jq '.status,.conclusion'
	echo
	if [[ "$(echo "$query_result" | jq '.conclusion' -r)" != "null" ]]
	then
		break
	fi
	sleep 2
done

echo "$query_result"
artifacts_url="$(echo "$query_result" | jq '.artifacts_url' -r)"
artifacts_query_result="$(curl -X 'GET' -H 'Accept: application/vnd.github+json' -H "Authorization: Bearer $token" -H 'X-GitHub-Api-Version: 2026-03-10' "$artifacts_url")"
artifact_zip_download_url_src_url="$(echo "$artifacts_query_result" | jq '.artifacts[] | select(.name == "result") | .archive_download_url' -r)"

artifact_zip_download_url_result=$(curl -sS -D - -H "Authorization: Bearer $token" -H 'X-GitHub-Api-Version: 2026-03-10' "$artifact_zip_download_url_src_url" -v -o /dev/null)
artifact_zip_download_url="$(echo "$artifact_zip_download_url_result" | grep --regex "^location:" | sed 's/location: //' | xargs)"
artifact_zip_download_url=${artifact_zip_download_url%$'\n'}
artifact_zip_download_url=${artifact_zip_download_url%$'\r'}

curl "$artifact_zip_download_url" -v -o result.zip
mkdir .$$.tmp
mv result.zip .$$.tmp
(
	cd .$$.tmp
	unzip result.zip
	echo
	echo "-------------------"
	echo "Auth token"
	echo "-------------------"
	cat auth-token.bin
)

rm -rf .$$.tmp
