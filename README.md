# CI/CD as a Classroom

## Configuration

If this repository is being used as the CI/CD backend and is hosted on GitHub,
the following repository variables and secrets must be configured in GitHub:

- Secrets:
  - `AUTH_APP_SECRET`: The client secret key used to finalize student
    authentication flows (e.g., via GitLab's OAuth flow or GitHub Apps).
  - `ASSIGNMENT_READ_TOKEN`: The access token that will be used to read
    assignment repository when accepting assignments for
    students. If the assignment repository is hosted on GitHub, then this
    should be a finegrained personal access token (PAT) with
    **Contents - Readonly** permissions for the assignment repository. If
    the assignment repository (project) is hosted on GitLab, then this
    can be a project access token, group access token, or finegrained personal
    access token with necessary and sufficient permissions to read the
    assignment repository (project).
  - `STUDENT_ASSIGNMENT_WRITE_TOKEN`: The access token that will be used to
    generate student assignment repositories within
    `STUDENT_ASSIGNMENT_ORGANIZATION` and grant students access to them. If
    
- Variables:
  - `AUTH_APP_ID`: The client ID used to conduct student authentication
    flows (e.g., via GitLab's OAuth flow or GitHub Apps).
  - `ASSIGNMENT_READ_USERNAME`: The username associated with the access token
    that will be used to read the assignment repository when
    accepting assignments for students. If the assignment
    repository is hosted on GitLab and the ASSIGNMENTS_READ_TOKEN
    secret is a project or group access token, then this variable can be
    **any non-blank value**
  - `ASSIGNMENT_REPO`: The URL of the remote git repository hosting all
    assignment template code, starting with the hostname. For
    example, `github.com/my_classroom_gh_organization/my_classroom`.
  - `STUDENT_PLATFORM`: The platform that's used to authenticate students
    (e.g., via OAuth or GitHub App) and store their generated assignment
    repositories. The user's username on said platform
    is used as the suffix for their generated assignment repositories'
    names. Must be either `github` or `gitlab`. If not set,
    `github` is inferred.
  - `STUDENT_PLATFORM_GIT_HOSTNAME`: The hostname for Git URLs for repositories
    hosted on `STUDENT_PLATFORM`. If `STUDENT_PLATFORM` is `github`, then
    `STUDENT_PLATFORM_GIT_HOSTNAME` is ignored and replaced with `github.com`.
    If `STUDENT_PLATFORM` is `gitlab`, then `STUDENT_PLATFORM_GIT_HOSTNAME`
    should be the hostname of your GitLab instance.
  - `STUDENT_ASSIGNMENT_ORGANIZATION`: The GitHub organization in which
    student assignment repositories should be created.
  - `STUDENT_ASSIGNMENT_WRITE_USERNAME`: The username of the account used
    to generate student assignment repositories within
    `STUDENT_ASSIGNMENT_ORGANIZATION`

If this repository is being used as the webapp and is hosted on GitHub,
the following repository variables and secrets must be configured in GitHub:

- Variables:
  - `STUDENT_PLATFORM`: Same interpretation as `STUDENT_PLATFORM` above.
