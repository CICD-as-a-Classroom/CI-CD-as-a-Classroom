# Git Classroom

Git Classroom is a free and open-source, lightweight, **self-hosted** (serverless) replacement for GitHub Classroom. It distributes programming assignments to students while keeping all the data under the ownership of the instructor.

All data is stored, and backend operations are performed, within repositories under the classroom's GitHub Organization. The organization does not reuqire a paid plan; a GitHub Free organization is sufficient. 

## Setting up a classroom

To set up a new classroom:

1. Clone this repository onto a system with an internet browser.
2. Install `python` and `pip` on your system (`python` usually ships with `pip`, except in some Linux distributions)
3. (Optional) Create a virtual environment in which to install the configuration tool's dependencies (e.g., `python -m venv classroom-env && source classroom-env/bin/activate`)
4. Navigate to the `config-tools` directory and install the config tool dependencies via `python -m pip install .`
5. Run the classroom setup script via `python create_classroom.py`
6. Follow the on-screen instructions.\
\
   You'll be asked to create a GitHub Organization for your classroom. You'll then be asked to navigate to a webpage hosted locally by the classroom setup tool that will guide you through registering and installing four GitHub Apps in your organization. These operations cannot be fully automated via the GitHub API, hence why they require your manual intervention in a browser.

Once the classroom setup script has finished, your organization should be populated with three repositories:
- `classrooms`: This is where you'll configure your classroom and assignments, including assignment templates (e.g., starter code and instructions documents) that will be instantiated to create students' assignment repositories. `classrooms` is a private repository; students cannot view it.
- `web`: This repository hosts the classroom's frontend web UI via GitHub Pages through which students can accept assignments. You generally shouldn't need to concern yourself with it. It's a public repository (in free GitHub organizations, GitHub Pages can only be used to host sites out of public repositories).
- `backend-workflows`. This repository hosts GitHub Actions workflows that serve as an event-driven backend to authenticate students, accept assignments, and so on. It's a private repository, and you generally shouldn't need to concern yourself with it.

## Administration (configuring the classroom, creating assignments, etc)

A classroom's configuration, assignment configurations, and assignment templates are all stored in the organization's `classrooms` repository. When this repository is generated (by following the above steps), it ships with a `README.md` file explaining how to administer the classroom (reconfigure the classroom and assignments, create new assignments, etc). It also explains how students accept assignments. [Here's](classrooms/README.md) a copy of that `README.md` file.

## Self-hosted runners

Git Classroom uses GitHub Actions workflows in the `backend-workflows` repository as a serverless backend. By default, these workflows run on GitHub-hosted runners (`ubuntu-latest`). Since these workflows execute for various semi-frequent user-facing operations (e.g., completing the OAuth flow, refreshing user access tokens, accepting assignments, etc), they can rack up a lot of GitHub Actions minutes, especially in large classes with many (e.g., hundreds of) students. GitHub Actions minutes are only free up to a certain per-organization limit depending on the organization's plan (2,000 minutes per month for Free plans; 3,000 for Team plans). Moreover, GitHub-hosted runners can be slow for a couple reasons: 1) there can sometimes be significant resource contention for GitHub-hosted runners, resulting in long pending times; and 2) GitHub-hosted runners are ephemeral with each job running in an isolated environment, which means they must reinstall all necessary dependencies (beyond what ships standard with the selected runner) at the start of each job execution.

For these reasons, if possible, it's strongly advised that instructors use one or more self-hosted runners for all workflows in the `backend-workflows` repository. This makes all backend operations within the classroom faster *and* free, regardless of the number of Actions minutes used (there's currently no limit to the number of free Actions minutes available for self-hosted runners, even on a GitHub Organization Free plan).

See [the GitHub docs](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners) for more information on how to configure self-hosted runners. Note that this will require manually editing the workflow files in the `backend-workflows` repository.

## Comparison with Classroom 50

[Classroom 50](https://classroom50.org/) is another free, open-source replacement for GitHub Classroom. It's an extensive, feature-rich platform with both web UI and CLI frontends. Similar to Git Classroom, all its major operations are run entirely within GitHub organizations and repositories (e.g., by making calls to the GitHub REST api, or via its `gh` CLI extensions).

However, Classroom 50 and Git Classroom differ significantly in how they handle "backend" operations, particularly in accepting assignments.

In Classroom 50, students are added to the classroom organization and then assigned to the student team, which is in turn given access to essential classroom resources like private assignment template repositories. All student operations are then authorized directly by the student's user access token acquired via an OAuth flow. The advantage of this design is that it doesn't require a backend for most operations (save a small central proxy server for completing the OAuth flow in the web UI). However, there are also several downsides to this design:

- It reduces the instructor's control over when and how assignment templates are viewed: the moment an assignment is added and its template registered, all students in the classroom's student team are simultaneously granted read access to its template (e.g., in the GitHub web UI), with or without an explicit assignment accept link. This makes it difficult to, say, make a lab exercise available to different students at different times depending on their lab sections. 
- Students must be added to the classroom's GitHub Organization in order to be a part of the student team and accept assignments.
- Students are generally given admin access to their assignment repositories since their user access tokens are used to create them (though, the permissions of a repository admin can be adjusted as a part of organization hardening).
- In general, certain features (e.g., those requiring authorization by protected secrets) are simply impossible to implement without a programmable backend, hence the above limitations.

GitHub Classroom avoided these issues by hiding privileged operations behind a central backend. Git Classroom's design philosophy is similar to GitHub Classroom's in this regard. By default, students are not given direct access to private assignment template repositories (templates are instantiated centrally by Git Classroom on the student's behalf upon clicking a link provided at the instructor's discretion); students are not admins of their own assignment repositories; and students do not need to be members of the classroom's GitHub organization. However, all these things can be reconfigured if desired. This is all made possible by exploiting GitHub Actions workflows as a sort of serverless backend.

(Classroom 50 uses a similar workflow-as-a-backend design for some infrequent teacher-facing operations like collecting scores and re-running autograders, but not for semi-frequent student-facing operations like accepting assignments and completing the OAuth flow.)

One downside to Git Classroom's design is that GitHub Actions workflows are asynchronous and event-driven; they're not designed for handling frequent, synchronous, short-lived, user-facing operations, but Git Classroom uses them for such purposes anyways. This design introduces an intentional tradeoff: it makes backend operations (e.g., authentication and accepting assignments) a bit slow, and it can rack up a lot of GitHub Actions minutes, but it enables certain centralized features while simultaneously keeping things serverless and easy to self-host. (Note that backend operations can be sped up signficantly by [using self-hosted runners](#self-hosted-runners).)

One final difference between Classroom 50 and Git Classroom is that Classroom 50 requires a GitHub Organization on a Team or Enterprise plan, whereas Git Classroom works with Free plans as well. However, if you're using an organization with a Free plan, you won't be able to configure branch protection rules or push rulesets in students' assignment repositories, and you'll be restricted to 2,000 Actions minutes per month if using GitHub-hosted runners.

## Troubleshooting and FAQ

- **Issue**: A student tries to accept an assignment and is met with this error message: `Repository already exists but somehow belongs to a different student [...] Instructor intervention is required.`\
\
**Explanation**: Students' GitHub usernames are used to name and identify their assignment repositories. However, GitHub usernames are mutable. If a student changes their GitHub username, and then another student happens to change their username to the previous username of the first student, the second student should not be given access to the first student's assignment repositories upon attempting to accept assignments. To ensure that's the case, when an assignment repository is first created, it's given a `STUDENT_ID` Actions variable storing the (immutable) GitHub ID of the student who generated it. This variable is used as a second layer of verification in subsequent attempts to accept the assignment (e.g., if the student accidentally lets their first invite expire and must reaccept it). If this second verification fails, either because students' GitHub usernames have changed or because the `STUDENT_ID` repository variable was accidentally modified, then the student will be met with the above error message when attempting to accept the assignment.\
\
**Solution**: Find the assignment repository by searching for it in the GitHub web UI. Its name should follow the pattern `<ASSIGNMENT NAME>-<STUDENT GITHUB USERNAME>`. Communicate with the student and determine whether the repository actually belongs to them. If so, navigate to the repository's settings &rarr; Secrets and variables &rarr; Actions &rarr; Variables tab &rarr; delete the `STUDENT_ID` repository variable; it will be regenerated correctly next time the student tries to accept the assignment. In the unlikely event that the repository *doesn't* belong to this student (but rather to a past student who happened to have the same GitHub username at one point), simply rename the repository to something unique&mdash;that will avoid the naming conflict next time the student tries to accept the assignment.
