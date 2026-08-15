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
- `classrooms`: This is where you'll configure your classroom and assignments, including assignment templates (e.g., starter code and instructions documents) that will be instantiated to create students' assignment repositories. `classrooms` is a private repository; students cannot view it. See [here](#Creating an assignment) for more information on creating assignments.
- `web`: This repository hosts the classroom's frontend web UI via GitHub Pages through which students can accept assignments. You generally shouldn't need to concern yourself with it. It's a public repository (in free GitHub organizations, GitHub Pages can only be used to host sites out of public repositories).
- `backend-workflows`. This repository hosts GitHub Actions workflows that serve as an event-driven backend to authenticate students, accept assignments, and so on. It's a private repository, and you generally shouldn't need to concern yourself with it.

## Creating assignments

Assignments are created by manually editing the contents of the `assignments/` directory within the `classrooms` repository. To create an assignment, do one or both of the following:

- Create a template subdirectory for the assignment and populate it with the assignment's template contents (`README.md`, starter code, etc). Note: assignment directory names should consist only of alphanumeric characters (`a-z`, `A-Z`, `0-9`), hyphens (`-`), underscores (`_`), and / or periods (`.`).
- In `assignments.conf`, create a new manifest entry for the assignment. `assignments.conf` is a [YAML](https://yaml.org/) file consisting of a list of assignment objects. Each assignment object may have the following fields:\
  1. (Required) `name`: The assignment's name. If the assignment has a template directory (as explained in the previous bullet point), this field's value must **exactly** match the name of the assignment's template directory (case-sensitive match).
  2. (Optional) `key`: The secret string of characters required to accept the assignment. Think of it as a password. To generate a link through which students can accept the assignment, the assignment's accept key must be embedded in the link as a query parameter (see below). If this field is omitted, then the assignment will have no accept key, and it can be accepted by anyone who knows (or can guess) the assignment's name.

An assignment with a template directory but no entry in `assignments.conf` will take on a default configuration (i.e., it will have no assignment accept key). An assignment with an entry in `assignments.conf` but no template directory will have no starter contents---when students accept the assignment, their repository will be empty with no commits.

When your classroom is first created, the `classrooms` repository ships with some example assignment configurations.

## Accepting an assignment

Once an assignment is created, a student can accept it by navigating to a link matching the following pattern:

`https://<ORGANIZATION NAME>.github.io/web?assignment-name=<ASSIGNMENT NAME>&assignment-accept-key=<ASSIGNMENT ACCEPT KEY>`

The instructor must create these links and share them with their students. Replace `<ORGANIZATION NAME>` with the name of the classroom's GitHub Organization, replace `<ASSIGNMENT NAME>` with the (case-sensitive) name of the assignment as configured in the `classrooms` repository, and replace `<ASSIGNMENT ACCEPT KEY>` with the assignment's accept key as configured in the `classrooms` repository. If the assignment has no accept key, then the `&assignment-accept-key=<ASSIGNMENT ACCEPT KEY>` part of the link can be omitted.

For example: 

`https://example-classroom-organization.github.io/web?assignment-name=assignment-1-hello-world&assignment-accept-key=secret-assignment-1-password`

When a student navigates to this link, it 1) asks the student to log into GitHub if they aren't already logged in; 2) asks them to authorize the classroom's Workflow Dispatch App if they haven't already done so (so that it can verify their identity, retrieve their username, and send them invites---it is **not** granted access to their personal GitHub resources); 3) creates a new repository owned by the classroom organization with the naming scheme `<ASSIGNMENT NAME>-<STUDENT USERNAME>`; 4) populates it with the assignment's template contents, if any; 5) sends the student an invite to the repository, and 6) redirects the student to the repository's main page, which will prompt them to accept the aforementioned invite.

Note: Currently, these repository invites only grant students `push` (`write`) access to their assignment repositories---not `admin` access. This means that students cannot currently add each other as collaborators to their assignment repositories. See [the roadmap](roadmap.md) for future plans to support such features.

## Self-hosted runners

Git Classroom uses GitHub Actions workflows in the `backend-workflows` repository as a serverless backend. By default, these workflows run on GitHub-hosted runners (`ubuntu-latest`). Since these workflows execute for various semi-frequent user-facing operations (e.g., completing the OAuth flow, refreshing user access tokens, accepting assignments, etc), they can rack up a lot of GitHub Actions minutes, especially in large classes with many (e.g., hundreds of) students. GitHub Actions minutes are only free up to a certain per-organization limit depending on the organization's plan (2,000 minutes per month for Free plans; 3,000 for Team plans). Moreover, GitHub-hosted runners can be slow for a couple reasons: 1) there can sometimes be significant resource contention for GitHub-hosted runners, resulting in long pending times; and 2) GitHub-hosted runners are ephemeral with each job running in an isolated environment, which means they must reinstall all necessary dependencies (beyond what ships standard with the selected runner) at the start of each job execution.

For these reasons, it's strongly advised that instructors use one or more self-hosted runners if possible. There's currently no limit to the number of free Actions minutes available to self-hosted runners, even on a GitHub Organization Free plan. Moreover, if you use self-hosted runners, your workflows won't suffer from long pending times when GitHub's runners are under heavy load, and all necessary dependencies can be pre-installed, significantly speeding up job executions.

See [the GitHub docs](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners) for more information on self-hosted runners.

## Comparison with Classroom 50

[Classroom 50](https://classroom50.org/) is another free, open-source replacement for GitHub Classroom. It's an extensive, feature-rich platform with both web UI and CLI frontends. Similar to Git Classroom, all its major operations are run entirely within GitHub organizations and repositories (e.g., by making calls to the GitHub REST api, or via its `gh` CLI extensions).

However, Classroom 50 and Git Classroom differ significantly in how they handle "backend" operations, particularly in accepting assignments.

In Classroom 50, students must be added to the classroom organization and then assigned to the student team (usually automatically via the Classroom 50 web UI or CLI frontend). From there, students effectively authorize all their own operations. For example, the student team has read access to all registered assignment templates, including private assignment template repositories within the classroom's organization (private assignment templates are linked to the student team when added to the classroom via the web UI or teacher-facing CLI). When a student wants to accept an assignment, their OAuth user access token is all that's needed to read and instantiate the assignment template. There are a few downsides to this design:

- It reduces the instructor's control over when and how assignment templates are viewed: the moment an assignment is added and its template registered, all students in the classroom's student team can see its template (e.g., in the GitHub web UI), with or without an explicit assignment access link.
- Students must be added to the classroom's GitHub Organization in order to be a part of the student team and accept assignments.
- Students are generally given admin access to their assignment repositories since their user access tokens are used to create them. (Though, the permissions of a repository admin can be adjusted as a part of organization hardening.)

In GitHub Classroom, there was never any need to share template repositories directly with students since its backend acted as a middleman: to accept an assignment, a student would click a link given to them at their instructor's discretion. The GitHub Classroom backend would then instantiate the template repository to generate the student's assignment repository and send them an invite. Moreover, since these assignment repositories were generated internally by GitHub Classroom instead of by the student's user access token, the student would not automatically be given admin access to their assignment repositories (unless configured as such). In fact, students didn't even need to be members of the classroom's organization; by default, they would be invited to their assignment repositories as outside collaborators. In essence, whereas Classroom 50 operates on the students' and teachers' behalf, GitHub Classroom operated primarily on the *classroom organization's* behalf.

Git Classroom's design philosophy is similar to GitHub Classroom's in this regard: a student accepts an assignment by clicking a link given to them at their instructor's discretion, at which point an intermediate backend instantiates the assignment template and sends the student an invite to their assignment repository. Assignment templates don't have to be shared with the students directly; students are not granted admin access to their assignment repositories by default; and students do not have to be members of the classroom organization. However, in contrast to GitHub Classroom, the intermediate backend is serverless, powered entirely by GitHub Actions workflows within the organization's `backend-workflows` repository. This repository is configured with service app secrets when the classroom is first created that grant it the necessary permissions to conduct all backend operations, and students interface with its workflows via a separate public-facing GitHub App with minimal, granular permissions (the Workflow Dispatch App, holding `issues: write` and `actions: read` permissions since workflows are launched by opening encrypted issues, and their results are published as encrypted artifacts).

(Classroom 50 uses a similar workflow-as-a-backend design for some infrequent teacher-facing operations like collecting scores and re-running autograders, but not for semi-frequent student-facing operations like accepting assignments and completing the OAuth flow.)

Moreover, Git Classroom does not require access to any students' or instructors' personal GitHub resources; rather, it requires access only to the classroom's organizational resources, in which it reads assignment templates, generates assignment repositories, and sends repository invites to students. It conducts an OAuth flow, but only to retrieve the student's username for purposes of looking up their GitHub ID, naming their assignment repositories, and sending them invites. The GitHub App through which students conduct the OAuth flow (the Workflow Dispatch App) is not (and *cannot*) be installed on students' GitHub accounts---it's entirely private to the classroom's organization.

One downside to Git Classroom's design is that GitHub Actions workflows are asynchronous and event-driven; they're not designed for handling frequent, synchronous, user-facing operations. Although the issues with GitHub-hosted runners can be mitigated with self-hosted runners as explained [above](#Self-hosted runners), even with self-hosted runners, backend operations may still be somewhat slow. This is an intentional tradeoff; exploiting GitHub Actions as a serverless backend is a hacky workaround, but it enables centralized features that *require* a backend (e.g., hiding assignment templates from students).

Another difference between Classroom 50 and Git Classroom is that Classroom 50 requires a GitHub Organization on a Team or Enterprise plan, whereas Git Classroom works with Free plans as well. However, if you're using an organization with a Free plan, you won't be able to configure branch protection rules or push rulesets in students' assignment repositories, and you'll be restricted to 2,000 Actions minutes per month if using GitHub-hosted runners.
