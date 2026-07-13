# CI/CD as a Classroom

## Configuration

If this repository is being used as the CI/CD backend and is hosted on GitHub,
the following repository variables and secrets must be configured in GitHub:

- Secrets:
  - `ASSIGNMENT_READ_TOKEN`: The access token that will be used to read
    (clone) assignment repositories / projects when accepting assignments for
    students. If the assignment repositories are hosted on GitHub, then this
    should be a finegrained personal access token (PAT) with
    **Contents - Readonly** permissions for the assignment repositories. If
    the assignment repositories (projects) are hosted on GitLab, then this
    can be a project access token, group access token, or finegrained personal
    access token with necessary and sufficient permissions to clone the
    assignment repositories (projects).
- Variables:
  - `ASSIGNMENT_READ_USERNAME`: The username associated with the access token
    that will be used to read (clone) assignment repositories / projects when
    accepting assignments for students. If the assignment
    repositories (projects) are hosted on GitLab and the ASSIGNMENTS_READ_TOKEN
    secret is a project or group access token, then this variable can be
    **any non-blank value**
  - `ASSIGNMENT_REPO_PATH_PREFIX`: The shared URL prefix of the git
    repositories, starting with the hostname, that host the assignments. For
    example, `github.com/my_classroom_gh_organization`. If
    all assignments are hosted in a single monorepo, then this variable can
    simply store the entire repository path, starting with the hostname. For
    example, `github.com/my_classroom_gh_organzation/assignments_monorepo`.


## Example execution of accept-assignment.yml workflow

If this repository is being used as the CI/CD backend and is hosted on GitHub,
to accept an assignment for a given student, dispatch the accept-assignment.yml
workflow (`.github/workflows/accept-assignment.yml`) with the following inputs:

- `userOauthToken`: A GitHub or GitLab OAuth token with necessary and
  sufficient permissions to read the user's username, create repositories
  under their ownership, and modify the administration settings of their
  repositories / projects.
- `assignmentRepoPathSuffix`: The suffix to be appended to
  `ASSIGNMENT_REPO_PATH_PREFIX` to construct the full assignment repository
  path to be copied. For example, if `ASSIGNMENT_REPO_PATH_PREFIX` is
  `github.com/my_classroom_gh_organization` and `assignmentRepoPathSuffix`
  is `assignment-1`, then the assignment repository located at
  `github.com/my_classroom_gh_organization/assignment-1` (which the
  `ASSIGNMENT_READ_TOKEN` must have the sufficient permissions to clone)
  will be copied to generate the student's repository. The prefix and suffix
  are always concatenated in such a way that they're separated by a single
  path separator (`/`).

  If all assignments
  are hosted in a single monorepo, then `ASSIGNMENT_REPO_PATH_PREFIX` can be
  set to the full path of the monorepo, starting with the hostname, and
  `assignmentRepoPathSuffix` can be omitted.

Below is an example cURL command to dispatch the workflow (e.g., for testing
purposes). Replace `<OWNER>` with the owner of this repository, replace
`<REPO>` with the name of this repository, and replace `<DISPATCH TOKEN>`
with a finegrained personal access token
capable of dispatching the workflow (requires
`Actions - Read/Write` and `Contents - Readonly` permissions):

```
curl -L \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <DISPATCH TOKEN>" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  https://api.github.com/repos/<OWNER>/<REPO>/actions/workflows/accept-assignment.yml/dispatches \
  -d '{"ref":"main","inputs":{"userOauthToken":"Mona the Octocat"}}'
```
