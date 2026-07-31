import shutil
import tempfile
import subprocess
from contextlib import chdir
from pathlib import Path
import json
import sys
import multiprocessing
import typing
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import time
import textwrap
import threading
import os
from base64 import b64encode

from nacl import encoding, public
from rich.console import Console
from rich.text import Text
from rich.live import Live
from rich.layout import Layout
from rich.panel import Panel
import pwinput
import requests


console = Console()


def rprint(*args: typing.Any, **kwargs: typing.Any) -> None:
    console.print(*args, **kwargs)


def rprint_wrapped(text: str, end: str='\n') -> None:
    lines = text.split('\n')
    for line in lines[:-1]:
        rprint(textwrap.fill(line, width=80, replace_whitespace=False, drop_whitespace=False))
    rprint(textwrap.fill(lines[-1], width=80, replace_whitespace=False, drop_whitespace=False), end=end)


PRESS_ENTER_TO_CONTINUE_MESSAGE = '[Press enter when you\'re ready to continue.]'
GREET_MESSAGE = (
    'This tool will guide you through the process of initializing a '
    'classroom so that you can distribute programming assignments '
    'to your students. Most of the work will be automated by this tool, '
    'but some manual intervention will be required.'
)


def greet() -> None:
    rprint_wrapped(GREET_MESSAGE)
    rprint()


REQUEST_ORGANIZATION_NAME_MESSAGE_1 = (
    'The first step is to create a GitHub Organization that will manage your '
    'classroom. This step cannot be automated and must be done within the '
    'GitHub web UI. You may use an existing GitHub Organization if you\'d '
    'like, but you must be an owner of the chosen Organization.\n'
    '\n'
    'Follow the below link to create a new GitHub Organization.'
)
REQUEST_ORGANIZATION_NAME_LINK = (
    'https://github.com/account/organizations/new'
)
REQUEST_ORGANIZATION_NAME_PROMPT = (
    'Enter the exact name of your GitHub Organization (case-sensitive): '
)
REQUEST_ORGANIZATION_NAME_REPROMPT = (
    'For confirmation, please enter the organization name again: '
)
REQUEST_ORGANIZATION_NAME_ERROR = (
    '[bold red]Error: The two organization names you entered did not match. '
    'Please try again.[/bold red]'
)


def request_organization_name() -> str:
    matching = False
    first = True
    while not matching:
        if first:
            rprint_wrapped(REQUEST_ORGANIZATION_NAME_MESSAGE_1)
            rprint()
            rprint(REQUEST_ORGANIZATION_NAME_LINK)
            rprint()

        organization_name_1 = input(REQUEST_ORGANIZATION_NAME_PROMPT)
        rprint()
        organization_name_2 = input(REQUEST_ORGANIZATION_NAME_REPROMPT)
        rprint()

        matching = organization_name_1 == organization_name_2
        if not matching:
            rprint_wrapped(REQUEST_ORGANIZATION_NAME_ERROR)

        first = False

    return organization_name_1


REQUEST_FG_PAT_MESSAGE_1 = (
    'In order to set up your classroom, a short-term (e.g., 1-day-expiration) '
    'GitHub finegrained '
    'personal access token (FG PAT) is '
    'required. The FG PAT should be configured as follows:'
)
REQUEST_FG_PAT_MESSAGE_2 = (
    'Repository access: All repositories\n'
    'Permissions:\n'
    '- Repositories -> Administration: Read and write\n'
    '- Repositories -> Contents: Read and write\n'
    '- Repositories -> Pages: Read and write\n'
    '- Repositories -> Secrets: Read and write\n'
    '- Repositories -> Variables: Read and write\n'
    '- Repositories -> Workflows: Read and write\n'
    '- Repositories -> Metadata: Read-only\n\n'
    'Please create an FG PAT by following the below link.'
)
REQUEST_FG_PAT_LINK = (
    'https://github.com/settings/personal-access-tokens/new'
)
REQUEST_FG_PAT_PROMPT = 'Paste your FG PAT here and press enter: '
REQUEST_FG_PAT_REPROMPT = (
    'For confirmation, please paste your FG PAT here again and press enter: '
)
REQUEST_FG_PAT_ERROR_MESSAGE = (
    '[bold red]Error: Your two pasted FG PATs did not match. Please try '
    'again.[/bold red]'
)


def request_fg_pat(organization_name: str) -> str:
    matching = False
    first = True
    while not matching:
        if first:
            rprint_wrapped(REQUEST_FG_PAT_MESSAGE_1)
            rprint()
            rprint_wrapped(f'Resource Owner: {organization_name}')
            rprint_wrapped(REQUEST_FG_PAT_MESSAGE_2)
            rprint()
            rprint(REQUEST_FG_PAT_LINK)
            rprint()
        
        fg_pat_1: str = \
            pwinput.pwinput(prompt=REQUEST_FG_PAT_PROMPT, mask='*')
        rprint()
        fg_pat_2: str = \
            pwinput.pwinput(prompt=REQUEST_FG_PAT_REPROMPT, mask='*')
        rprint()
        matching = fg_pat_1 == fg_pat_2

        if not matching:
            rprint_wrapped(REQUEST_FG_PAT_ERROR_MESSAGE)
            rprint()

        first = False

    return fg_pat_1


class NotifyingServer(ThreadingHTTPServer):
    def __init__(
            self,
            server_address: tuple[str, int],
            RequestHandlerClass: type,
            server_state: ServerState):
        self._server_state = server_state
        super().__init__(server_address, RequestHandlerClass)

    # Notifies main thread that server is up and running via
    # threading.Event
    def server_activate(self) -> None:
        super().server_activate()
        self._server_state.up = True
        self._server_state.ready_event.set()


class AppRegistrationResponse:
    app_id: int
    client_id: str
    client_secret: str
    private_key: str

    def __init__(
            self,
            app_id: int,
            client_id: str,
            client_secret: str,
            private_key: str) -> None:
        self.app_id = app_id
        self.client_id = client_id
        self.client_secret = client_secret
        self.private_key = private_key


class AppInstallationResponse:
    installation_id: str

    def __init__(self, installation_id: str) -> None:
        self.installation_id = installation_id


class RepositoryCreationData:
    id: int
    html_url: str

    def __init__(self, id: int, html_url: str) -> None:
        self.id = id
        self.html_url = html_url


class AppDetails:
    installation_instructions: str
    next_registration_endpoint: str | None
    def __init__(
            self,
            installation_instructions: str,
            next_registration_endpoint: str | None = None) -> None:
        self.installation_instructions = installation_instructions
        self.next_registration_endpoint = next_registration_endpoint


class HandlerContext:
    # TODO consolidate the various app-specific constants / dicts into
    # APP_DETAILS
    REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT = \
        'workflow-dispatch-app'
    REGISTER_ASSIGNMENT_TEMPLATE_READING_APP_ENDPOINT = \
        'assignment-template-reading-app'
    REGISTER_STUDENT_ASSIGNMENT_WRITING_APP_ENDPOINT = \
        'student-assignment-writing-app'
    APP_MANIFEST_ENDPOINTS = [
        REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT,
        REGISTER_ASSIGNMENT_TEMPLATE_READING_APP_ENDPOINT,
        REGISTER_STUDENT_ASSIGNMENT_WRITING_APP_ENDPOINT,
    ]
    APP_NAMES = {
        REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT: \
            'Backend Workflow Dispatch',
        REGISTER_ASSIGNMENT_TEMPLATE_READING_APP_ENDPOINT: \
            'Assignment Template Reading',
        REGISTER_STUDENT_ASSIGNMENT_WRITING_APP_ENDPOINT: \
            'Student Assignment Writing'
    }
    APP_DESCRIPTIONS = {
        REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT: ('App embedded in '
            'classroom\'s student-facing web frontend. Used to dispatch '
            'backend workflows (e.g., to authenticate students and accept '
            'assignments).'),
        REGISTER_STUDENT_ASSIGNMENT_WRITING_APP_ENDPOINT: ('App used to '
            'generate, populate, and generate invites for student '
            'assignment repositories.'),
        REGISTER_ASSIGNMENT_TEMPLATE_READING_APP_ENDPOINT: ('App used to '
            'read assignment template repository contents for configuring '
            'and initializing student assignment repositories upon assignment '
            'acceptance.')
    }
    APP_PERMISSIONS = {
        REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT: {
            'actions': 'write',
            'contents': 'read',
            'metadata': 'read'
        },
        REGISTER_STUDENT_ASSIGNMENT_WRITING_APP_ENDPOINT: {
            'administration': 'write',
            'contents': 'write',
            'metadata': 'read'
        },
        REGISTER_ASSIGNMENT_TEMPLATE_READING_APP_ENDPOINT: {
            'contents': 'read',
            'metadata': 'read'
        }
    }
    APP_DETAILS = {
        REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT: AppDetails(
            installation_instructions=(f'Install the workflow dispatch app '
                'in your GitHub Organization '
                'on the "backend-workflows" repository. CRITICAL: '
                'Install this app ONLY on the "backend-workflows" '
                'repository. Do NOT install it on all repositories.'),
            next_registration_endpoint=\
                REGISTER_STUDENT_ASSIGNMENT_WRITING_APP_ENDPOINT
        ),
        REGISTER_STUDENT_ASSIGNMENT_WRITING_APP_ENDPOINT: AppDetails(
            installation_instructions=(f'Install the student assignment '
                'writing app in your GitHub '
                'Organization on ALL repositories.'),
            next_registration_endpoint=\
                REGISTER_ASSIGNMENT_TEMPLATE_READING_APP_ENDPOINT
        ),
        REGISTER_ASSIGNMENT_TEMPLATE_READING_APP_ENDPOINT: AppDetails(
            installation_instructions=(f'Install the assignment template '
                'reading app in your GitHub '
                'Organization on ALL repositories.')
        )
    }
    content_events: dict[str, threading.Event]
    organization_name: str
    fg_pat: str
    server_port: int | None
    all_repository_creation_data: dict[str, RepositoryCreationData]
    app_registration_responses: dict[str, AppRegistrationResponse]
    app_installation_responses: dict[str, AppInstallationResponse]
    
    def __init__(
            self,
            organization_name: str,
            fg_pat: str,
            all_repository_creation_data: dict[str, RepositoryCreationData])\
            -> None:
        self.organization_name = organization_name
        self.fg_pat = fg_pat
        self.content_events = {
            endpoint: threading.Event() for endpoint in \
                self.APP_MANIFEST_ENDPOINTS
        }
        self.server_port = None
        self.all_repository_creation_data = all_repository_creation_data
        self.app_registration_responses = {}
        self.app_installation_responses = {}


URL_CHARS="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890-_"
def secure_random_url_string(length: int) -> str:
    random_bytes = os.urandom(length)
    random_chars = [URL_CHARS[byte % len(URL_CHARS)] for byte in random_bytes]
    return ''.join(random_chars)


def get_handler_class(context: HandlerContext) -> type:
    class Handler(BaseHTTPRequestHandler):
        def register_app(self, registration_endpoint: str) -> None:
            app_name = context.APP_NAMES[
                registration_endpoint
            ]
            app_default_permissions = \
                json.dumps(context.APP_PERMISSIONS[registration_endpoint])
            state_string = secure_random_url_string(32)
            context.state_string = state_string
            html=f'''<html><head><meta http-equiv="Cache-Control" content="no-cache"><meta charset="UTF-8"></head><body><div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center"><div style="margin-bottom: 1em">Next action item: register the {app_name} app on GitHub.</div><form id="manifest-form" action="https://github.com/organizations/{context.organization_name}/settings/apps/new?state={state_string}" method="post">
<input type="hidden" name="manifest" id="manifest">
<input type="submit" value="Click here to begin action item">
</form></div>

<script>
window.addEventListener('DOMContentLoaded', () => {{
  form = document.getElementById("manifest-form")
  input = document.getElementById("manifest")
  input.value = JSON.stringify({{
    "name": "{app_name}",
    "url": "https://github.com/{context.organization_name}",
    "redirect_url": "http://localhost:{context.server_port}/{registration_endpoint}/install",
    "callback_urls": [
      "https://{context.organization_name}.github.io/web/finalize-auth"
    ],
    "setup_url": "http://localhost:{context.server_port}/{registration_endpoint}/setup",
    "description": "{context.APP_DESCRIPTIONS[registration_endpoint]}",
    "public": false,
    "default_permissions": {app_default_permissions},
    "setup_on_update": true
  }})
}});
</script></body></html>'''

            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(html.encode('utf-8'))


        def register_workflow_dispatch_app(self) -> None:
            self.register_app(
                context.REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT
            )


        def register_student_assignment_writing_app(self) -> None:
            self.register_app(
                context.REGISTER_STUDENT_ASSIGNMENT_WRITING_APP_ENDPOINT
            )


        def register_assignment_template_reading_app(self) -> None:
            self.register_app(
                context.REGISTER_ASSIGNMENT_TEMPLATE_READING_APP_ENDPOINT
            )


        def install_app(self, registration_endpoint: str) -> None:
            app_name = context.APP_NAMES[
                registration_endpoint
            ]
            path_params = self.path.split('?')[1].split('&')
            path_params_tuple_list = [
                tuple(param.split('=')) for param in path_params
            ]
            path_params_dict = {
                name: value for (name, value) in path_params_tuple_list
            }

            state_string = path_params_dict['state']
            code = path_params_dict['code']

            if state_string != context.state_string:
                self.send_response(500)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                self.wfile.write(b'Error: State string doesn\'t match')
                return
            
            headers = {
                'X-GitHub-Api-Version': '2026-03-10',
                'Accept': 'application/vnd.github+json'
            }
            response = requests.post(
                f'https://api.github.com/app-manifests/{code}/conversions',
                headers=headers
            )

            if response.status_code < 200 or response.status_code >= 300:
                self.send_response(500)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                self.wfile.write(b'Error: Failed to finalize app registration')
                return

            response_json = response.json()

            app_id = response_json['id']
            client_id = response_json['client_id']
            client_secret = response_json['client_secret']
            private_key = response_json['pem']
            context.app_registration_responses[
                registration_endpoint
            ] = AppRegistrationResponse(
                app_id,
                client_id,
                client_secret,
                private_key
            )

            html_url = response_json['html_url']
            installation_url=f'{html_url}/installations/new'

            html=f'''<html><head><meta http-equiv="Cache-Control" content="no-cache"><meta charset="UTF-8"></head><body><div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center"><div style="margin-bottom: 1em">Next action item: {context.APP_DETAILS[registration_endpoint].installation_instructions}</div><form id="manifest-form" action="{installation_url}" method="get">
<input type="submit" value="Click here to begin action item">
</form></div></body></html>
'''

            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(html.encode('utf-8'))


        def install_workflow_dispatch_app(self) -> None:
            self.install_app(
                context.REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT
            )


        def install_student_assignment_writing_app(self) -> None:
            self.install_app(
                context.REGISTER_STUDENT_ASSIGNMENT_WRITING_APP_ENDPOINT
            )


        def install_assignment_template_reading_app(self) -> None:
            self.install_app(
                context.REGISTER_ASSIGNMENT_TEMPLATE_READING_APP_ENDPOINT
            )


        def setup_app(self, registration_endpoint: str) -> None:
            app_name = context.APP_NAMES[
                registration_endpoint
            ]
            path_params = self.path.split('?')[1].split('&')
            path_params_tuple_list = [
                tuple(param.split('=')) for param in path_params
            ]
            path_params_dict = {
                name: value for (name, value) in path_params_tuple_list
            }

            installation_id = str(path_params_dict['installation_id'])

            context.app_installation_responses[
                    registration_endpoint
            ] = AppInstallationResponse(installation_id)

            # TODO Run context.APP_DETAILS[registration_endpoint].installation_verifier
            # to make sure it was installed properly (workflow dispatch app
            # should only be installed on the backend-workflows repo, and it
            # should only have read permissions on its contents (and write
            # permissions on actions); student assignment writing app should
            # be installed on all organization repositories with writing
            # permissions on contents and administration; assignment template
            # reading app should be installed on all organization repositories
            # with reading permissions on contents). Such verifications
            # will require generating and signing a JWT, exchanging it for
            # an installation access token, and using it in the
            # GET /installation/repositories endpoint. This can at least be
            # used to check for which / how many repositories an installation
            # has access to. If I want to robustly verify that the user didn't
            # mess with app permissions, I'll have to use additional endpoints
            # after that to check memberships using the installation access
            # token as the auth bearer. But that's probably excessive.
            # Anyways, this function can generate and sign the JWT, exchange for
            # the installation access token, and query the endpoint. The
            # endpoint-specific installation verifier function will just
            # verify the response of that query, and conduct additional
            # queries if necessary.

            # Else, installation was configured properly. 
            next_registration_endpoint = \
                context.APP_DETAILS[registration_endpoint]\
                    .next_registration_endpoint
            if next_registration_endpoint is None:
                # No more apps to register. Direct user to
                # close the browser window and return to their terminal.
                html=f'<html><head><meta http-equiv="Cache-Control" content="no-cache"/><meta charset="UTF-8"></head><body><div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center"><div style="margin-bottom: 1em">Browser flow complete. Please close this browser tab and return to your terminal for the next steps.</div></div></body></html>'

                self.send_response(200)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                self.wfile.write(html.encode('utf-8'))
            else:
                # Redirect user to next app registration endpoint
                self.send_response(302)
                self.send_header(
                    'Location',
                    f'/{next_registration_endpoint}'
                )
                self.end_headers()
                self.wfile.write(b'')

            context.content_events[
                registration_endpoint
            ].set()


        def setup_workflow_dispatch_app(self) -> None:
            self.setup_app(
                context.REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT
            )


        def setup_student_assignment_writing_app(self) -> None:
            self.setup_app(
                context.REGISTER_STUDENT_ASSIGNMENT_WRITING_APP_ENDPOINT
            )


        def setup_assignment_template_reading_app(self) -> None:
            self.setup_app(
                context.REGISTER_ASSIGNMENT_TEMPLATE_READING_APP_ENDPOINT
            )
            

        path_handlers = {
            f'/{context.REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT}': \
                register_workflow_dispatch_app,
            f'/{context.REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT}/install': \
                install_workflow_dispatch_app,
            f'/{context.REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT}/setup': \
                setup_workflow_dispatch_app,
            f'/{context.REGISTER_STUDENT_ASSIGNMENT_WRITING_APP_ENDPOINT}': \
                register_student_assignment_writing_app,
            f'/{context.REGISTER_STUDENT_ASSIGNMENT_WRITING_APP_ENDPOINT}/install': \
                install_student_assignment_writing_app,
            f'/{context.REGISTER_STUDENT_ASSIGNMENT_WRITING_APP_ENDPOINT}/setup': \
                setup_student_assignment_writing_app,
            f'/{context.REGISTER_ASSIGNMENT_TEMPLATE_READING_APP_ENDPOINT}': \
                register_assignment_template_reading_app,
            f'/{context.REGISTER_ASSIGNMENT_TEMPLATE_READING_APP_ENDPOINT}/install': \
                install_assignment_template_reading_app,
            f'/{context.REGISTER_ASSIGNMENT_TEMPLATE_READING_APP_ENDPOINT}/setup': \
                setup_assignment_template_reading_app,
        }


        def do_GET(self) -> None:
            # Remove query parameters and trailing / from path
            paramless_path = self.path.split('?')[0]
            if paramless_path[-1] == '/':
                paramless_path = paramless_path[:-1]

            # Find path handler and execute, else send 404
            if paramless_path in Handler.path_handlers:
                Handler.path_handlers[paramless_path](self)
            else:
                self.send_response(404)
                self.send_header('Content-type', 'text/html')
                self.end_headers()
                self.wfile.write(b'')

        def log_message(self, format, *args) -> None:
            pass # Hides default status messages

    return Handler


class ServerState:
    ready_event: threading.Event
    context: HandlerContext
    server: NotifyingServer | None
    up: bool
    
    def __init__(self, context: HandlerContext) -> None:
        self.ready_event = threading.Event()
        self.context = context
        self.server = None
        self.up = False


MIN_PORT = 8000
MAX_PORT = 8100


def start_server_thread_entry(server_state: ServerState) -> None:
    served = False
    for port in range(MIN_PORT, MAX_PORT + 1):
        try:
            server_state.context.server_port = port
            server = NotifyingServer(
                ('localhost', port),
                get_handler_class(server_state.context),
                server_state
            )
            server_state.server = server
            server.serve_forever()
            served = True
            break
        except OSError:
            server_state.context.server_port = None
            server_state.server = None

    if not served:
        server_state.ready_event.set()


START_SERVER_ERROR_MESSAGE = (
    f'[bold red]Error: Failed to start server. Make sure there\'s an open '
    f'port in the range [{MIN_PORT}, {MAX_PORT}] that isn\'t blocked by '
    f'firewall rules.'
)


def start_server(server_state: ServerState) -> threading.Thread:
    server_thread = threading.Thread(
        target=start_server_thread_entry,
        args=(server_state,)
    )
    server_thread.start()
    server_state.ready_event.wait()
    return server_thread


BROWSER_FLOW_MESSAGE_1 = (
    'Next, your organization will need three private GitHub Apps '
    'for, respectively:\n'
    '- dispatching backend workflows from the web frontend to '
    'authenticate students and allow them to accept assignments\n'
    '- reading assignment template code and configurations\n'
    '- writing and administering student assignment repositories\n\n'
    'These apps will be registered from respective preconfigured manifests, '
    'but the registration requires your approval via GitHub\'s web '
    'UI.\n\n'
    'Follow the below link to begin the app registration flow.'
)


def browser_flow(handler_context: HandlerContext) -> None:
    server_state = ServerState(
        handler_context
    )
    server_thread = start_server(server_state)
    if not server_state.up:
        rprint(START_SERVER_ERROR_MESSAGE)
        raise OSError('Failed to start server')

    console.log(
        f'Local webserver for browser operations '
        f'running on port {server_state.context.server_port}'
    )
    rprint()

    rprint_wrapped(BROWSER_FLOW_MESSAGE_1)
    rprint()
    rprint(f'http://localhost:'
        f'{server_state.context.server_port}/'
        f'{server_state.context.REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT}')

    for _, event in server_state.context.content_events.items():
        event.wait()

    # User has finished browser flow
    
    if server_state.server is not None:
        server_state.server.shutdown() # Tells server loop to stop
        server_state.server.server_close() # Releases network resources
        try:
            # Dummy request to break server loop if necessary
            requests.get(f'http://localhost:{server_state.context.server_port}')
        except Exception:
            pass

    server_thread.join()


class RepositoryInputData:
    description: str
    private: bool
    relative_file_paths: list[str]

    def __init__(
            self,
            description: str,
            private: bool,
            relative_file_paths: list[str]) -> None:
        self.description = description
        self.private = private
        self.relative_file_paths = relative_file_paths


ALL_REPOSITORY_INPUT_DATA = {
    'backend-workflows': RepositoryInputData(
        description=('This repository strictly '
            'contains backend workflows dispatched by the web frontend '
            '(e.g., to authenticate students, accept assignments, etc).'),
        private=True,
        relative_file_paths=[
            '.github/workflows/accept-assignment.yml',
            '.github/workflows/gen-user-auth-tokens-github.yml',
            '.github/workflows/refresh-auth-tokens.yml',
            'workflow-util'
        ]
    ),
    'web': RepositoryInputData(
        description=('This repository contains the web frontend '
            'that students interact with to authenticate, '
            'accept assignments, etc'),
        private=False,
        relative_file_paths=[
            '.github/workflows/build-site.yml',
            'site'
        ],
    ),
    'assignment-templates': RepositoryInputData(
        description=('This repository contains '
            'assignment configuration files, as well as assignment templates '
            '(starter code) '
            'that are copied into students\' assignment repositories '
            'upon creation (assignment acceptance).'),
        private=True,
        relative_file_paths=[
            'assignments'
        ]
    ),
}


def create_repository(
        organization_name: str,
        fg_pat: str,
        repository_name: str,
        input_data: RepositoryInputData) -> RepositoryCreationData:
    headers = {
        'X-GitHub-Api-Version': '2026-03-10',
        'Accept': 'application/vnd.github+json',
        'Authorization': f'Bearer {fg_pat}'
    }
    
    # Check if repo already exists.
    response = requests.get(
        f'https://api.github.com/repos/{organization_name}/{repository_name}',
        headers=headers
    )
    if response.status_code == 200:
        # Repo exists. Return info.
        response_json = response.json()
        return RepositoryCreationData(
            response_json['id'],
            response_json['html_url']
        )

    # Repo doesn't exist. Create it.
    body = {
        'name': repository_name,
        'private': input_data.private,
        'description': input_data.description
    }
    response = requests.post(
        f'https://api.github.com/orgs/{organization_name}/repos',
        headers=headers,
        json=body
    )

    if (response.status_code < 200 or response.status_code >= 300):
        raise ValueError(f'Failed to create repository {repository_name}; got '
            f'HTTP status code {response.status_code}')

    response_json = response.json()
    return RepositoryCreationData(
        response_json['id'],
        response_json['html_url']
    )


def create_repositories(
        organization_name: str,
        fg_pat: str) -> dict[str, RepositoryCreationData]:
    result = {}
    for repository_name, input_data in ALL_REPOSITORY_INPUT_DATA.items():
        console.log(f'Creating repository {repository_name} in organization '
            f'{organization_name}...')
        result[repository_name] = create_repository(
            organization_name,
            fg_pat,
            repository_name,
            input_data
        )

    return result


def create_repository_variable(
        organization_name: str,
        fg_pat: str,
        repository_name: str,
        variable_name: str,
        variable_value: str) -> None:
    headers = {
        'X-GitHub-Api-Version': '2026-03-10',
        'Accept': 'application/vnd.github+json',
        'Authorization': f'Bearer {fg_pat}'
    }
    body = {
        'name': variable_name,
        'value': variable_value
    }
    response = requests.post(
        f'https://api.github.com/repos/{organization_name}/{repository_name}/actions/variables',
        headers=headers,
        json=body
    )

    if response.status_code == 409:
        # Variable already exists. Update it.
        response = requests.patch(
            f'https://api.github.com/repos/{organization_name}/{repository_name}/actions/variables/{variable_name}',
            headers=headers,
            json=body
        )
        if response.status_code < 200 or response.status_code >= 300:
            raise ValueError(f'Got HTTP status code {response.status_code} when '
                f'updating repository variable')
    elif response.status_code < 200 or response.status_code >= 300:
        # 201 means created, 409 means already exists (conflict). Anything else
        # is an unexpected error.
        raise ValueError(f'Got HTTP status code {response.status_code} when '
            f'creating repository variable')


def create_repository_variables(
        organization_name: str,
        fg_pat: str,
        handler_context: HandlerContext) -> None:
    all_variables = {
        'backend-workflows': [
            ('STUDENT_ASSIGNMENT_ORGANIZATION', organization_name),
            ('ASSIGNMENT_TEMPLATE_REPO',
                f'github.com/{organization_name}/assignment-templates.git'),
            ('STUDENT_ASSIGNMENT_WRITING_APP_ID',
                handler_context.app_registration_responses[
                    handler_context.REGISTER_STUDENT_ASSIGNMENT_WRITING_APP_ENDPOINT
                ].client_id),
            ('STUDENT_ASSIGNMENT_WRITING_APP_INSTALLATION_ID',
                handler_context.app_installation_responses[
                    handler_context.REGISTER_STUDENT_ASSIGNMENT_WRITING_APP_ENDPOINT
                ].installation_id),
            ('ASSIGNMENT_TEMPLATE_READING_APP_ID',
                handler_context.app_registration_responses[
                    handler_context.REGISTER_ASSIGNMENT_TEMPLATE_READING_APP_ENDPOINT
                ].client_id),
            ('ASSIGNMENT_TEMPLATE_READING_APP_INSTALLATION_ID',
                handler_context.app_installation_responses[
                    handler_context.REGISTER_ASSIGNMENT_TEMPLATE_READING_APP_ENDPOINT
                ].installation_id),
            ('AUTH_CLIENT_ID',
                handler_context.app_registration_responses[
                    handler_context.REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT
                ].client_id),
        ],
        'web': [
            ('PUBLIC_PATH', '/web/'),
            ('POLL_DELAY', '2000'),
            ('AUTH_CLIENT_ID',
                handler_context.app_registration_responses[
                    handler_context.REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT
                ].client_id),
            ('BACKEND_REPO_OWNER', organization_name),
            ('BACKEND_REPO', 'backend-workflows'),
            ('WORKFLOW_DISPATCH_APP_ID',
                handler_context.app_registration_responses[
                    handler_context.REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT
                ].client_id),
            ('WORKFLOW_DISPATCH_APP_INSTALLATION_ID',
                handler_context.app_installation_responses[
                    handler_context.REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT
                ].installation_id),
        ]
    }
    
    for repository, variables in all_variables.items():
        for name, value in variables:
            console.log(f'Creating repository variable {name}={value}...')
            create_repository_variable(
                organization_name,
                fg_pat,
                repository,
                name,
                value
            )


def get_repository_public_key(
        organization_name: str,
        repository_name: str,
        fg_pat: str) -> tuple[public.PublicKey, str]:
    headers = {
        'X-GitHub-Api-Version': '2026-03-10',
        'Accept': 'application/vnd.github+json',
        'Authorization': f'Bearer {fg_pat}'
    }
    response = requests.get(
        f'https://api.github.com/repos/{organization_name}/{repository_name}/actions/secrets/public-key',
        headers=headers
    )
    
    if response.status_code < 200 or response.status_code >= 300:
        raise ValueError(f'Got HTTP status code {response.status_code} when '
            f'retrieving repository public key')

    response_json = response.json()
    public_key = public.PublicKey(
        response_json['key'].encode("utf-8"),
        encoding.Base64Encoder()
    )
    return public_key, response_json['key_id']


def encrypt(public_key: public.PublicKey, plaintext: str) -> str:
    sealed_box = public.SealedBox(public_key)
    encrypted = sealed_box.encrypt(plaintext.encode("utf-8"))
    return b64encode(encrypted).decode("utf-8")


def create_repository_secret(
        organization_name: str,
        fg_pat: str,
        repository_name: str,
        secret_name: str,
        secret_value: str,
        public_key: str,
        key_id: str) -> None:
    encrypted_value = encrypt(public_key, secret_value)
    headers = {
        'X-GitHub-Api-Version': '2026-03-10',
        'Accept': 'application/vnd.github+json',
        'Authorization': f'Bearer {fg_pat}'
    }
    body = {
        'encrypted_value': encrypted_value,
        'key_id': key_id
    }
    response = requests.put(
        f'https://api.github.com/repos/{organization_name}/{repository_name}/actions/secrets/{secret_name}',
        headers=headers,
        json=body
    )

    if response.status_code < 200 or response.status_code >= 300:
        raise ValueError(f'Got HTTP status code {response.status_code} when '
            f'creating repository secret')


def create_repository_secrets(
        organization_name: str,
        fg_pat: str,
        handler_context: HandlerContext) -> None:
    all_secrets = {
        'backend-workflows': [
            ('AUTH_CLIENT_SECRET',
                handler_context.app_registration_responses[
                    handler_context.REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT
                ].client_secret),
            ('STUDENT_ASSIGNMENT_WRITING_APP_PRIVATE_KEY',
                handler_context.app_registration_responses[
                    handler_context.REGISTER_STUDENT_ASSIGNMENT_WRITING_APP_ENDPOINT
                ].private_key),
            ('ASSIGNMENT_TEMPLATE_READING_APP_PRIVATE_KEY',
                handler_context.app_registration_responses[
                    handler_context.REGISTER_ASSIGNMENT_TEMPLATE_READING_APP_ENDPOINT
                ].private_key),
        ],
        'web': [
            ('WORKFLOW_DISPATCH_APP_PRIVATE_KEY',
                handler_context.app_registration_responses[
                    handler_context.REGISTER_WORKFLOW_DISPATCH_APP_ENDPOINT
                ].private_key),
        ]
    }
    
    for repository, secrets in all_secrets.items():
        public_key, key_id = get_repository_public_key(organization_name, repository, fg_pat)
        for name, value in secrets:
            console.log(f'Creating repository secret {name}...')
            create_repository_secret(
                organization_name,
                fg_pat,
                repository,
                name,
                value,
                public_key,
                key_id
            )


def create_github_pages_site(organization_name: str, fg_pat: str) -> None:
    headers = {
        'X-GitHub-Api-Version': '2026-03-10',
        'Accept': 'application/vnd.github+json',
        'Authorization': f'Bearer {fg_pat}'
    }
    body = {
        'build_type': 'workflow'
    }
    response = requests.post(
        f'https://api.github.com/repos/{organization_name}/web/pages',
        headers=headers,
        json=body
    )
    
    if response.status_code == 409:
        # Conflict. Pages site already exists. Update its configuration.
        response = requests.put(
            f'https://api.github.com/repos/{organization_name}/web/pages',
            headers=headers,
            json=body
        )
        if response.status_code < 200 or response.status_code >= 300:
            raise ValueError(f'Got HTTP status code {response.status_code} when '
                f'updating GitHub Pages site')
    elif response.status_code < 200 or response.status_code >= 300:
        # Anything other than HTTP 201 / 409 is an error
        raise ValueError(f'Got HTTP status code {response.status_code} when '
            f'creating GitHub Pages site')


def get_github_username(fg_pat: str) -> str:
    headers = {
        'X-GitHub-Api-Version': '2026-03-10',
        'Accept': 'application/vnd.github+json',
        'Authorization': f'Bearer {fg_pat}'
    }
    response = requests.get(
        'https://api.github.com/user',
        headers=headers
    )
    if response.status_code < 200 or response.status_code >= 300:
        raise ValueError(f'Got HTTP status code {response.status_code} when '
            f'retrieving GitHub username')
    response_json = response.json()
    return response_json['login']


def populate_repository(
        organization_name: str,
        github_username: str,
        fg_pat: str,
        repository_name: str,
        relative_file_paths: list[Path]) -> None:
    # Find this repo's root directory (closest ancestor containing .git
    # directory), falling back to this script's grandparent if .git isn't found
    base_src_dir_path = Path(__file__).resolve().parent
    while not (base_src_dir_path / '.git').is_dir():
        abs_path = base_src_dir_path.resolve()
        if abs_path == abs_path.parent:
            # Navigated to root dir. No more ancestors to navigate. Default to
            # this script's grandparent.
            base_src_dir_path = Path(__file__).resolve().parent.parent
            console.log(f'Failed to ascertain this repository\'s root '
                f'directory (perhaps .git folder is missing?). Falling '
                f'back to {base_src_dir_path}')
            break
        
        # More ancestors to navigate. Keep going.
        base_src_dir_path = base_src_dir_path.parent

    # Create temp directory to house local repo contents
    with tempfile.TemporaryDirectory() as base_dst_dir_path_str:
        base_dst_dir_path = Path(base_dst_dir_path_str)
        
        # Set working directory to tmp directory
        with chdir(base_dst_dir_path):
            # Clone git repository
            remote_repo_git_url = (
                f'https://{github_username}:{fg_pat}@github.com/'
                f'{organization_name}/{repository_name}.git'
            )
            subprocess.run(
                ['git', 'clone', remote_repo_git_url,
                    str(base_dst_dir_path.resolve())],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            
            # Git config
            subprocess.run(
                ['git', 'config', 'user.name', 'Classroom Config'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            subprocess.run(
                ['git', 'config', 'user.email', '<>'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )

            # Copy target contents into local repo, merging with existing
            # contents
            for relative_file_path_str in relative_file_paths:
                # Compute complete src and dst file paths
                relative_file_path = Path(relative_file_path_str)
                complete_src_file_path = base_src_dir_path / relative_file_path
                complete_dst_file_path = base_dst_dir_path /\
                    relative_file_path

                # Create parent directory within temp directory to house copy
                complete_dst_file_path.parent.mkdir(parents=True, exist_ok=True)

                # Copy file / directory
                if complete_src_file_path.is_file():
                    shutil.copy(
                        complete_src_file_path,
                        complete_dst_file_path
                    )
                elif complete_src_file_path.is_dir():
                    shutil.copytree(
                        complete_src_file_path,
                        complete_dst_file_path,
                        dirs_exist_ok=True
                    )

            # Copy repo-specific README.md file
            readme_src_file_path = \
                base_src_dir_path / f'README-{repository_name}.md'
            readme_dst_file_path = \
                base_dst_dir_path / 'README.md'
            shutil.copy(
                readme_src_file_path,
                readme_dst_file_path
            )
            
            # Stage all updated files
            subprocess.run(
                ['git', 'add', '-A'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )

            # Create commit
            subprocess.run(
                ['git', 'commit', '-m', 'Classroom Config: Init'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )

            # Push upstream
            subprocess.run(
                ['git', 'push', remote_repo_git_url, 'main'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )


def populate_repositories(
        organization_name: str,
        github_username: str,
        fg_pat: str) -> None:
    for repository_name, input_data in ALL_REPOSITORY_INPUT_DATA.items():
        console.log(f'Populating GitHub repository '
            f'"{organization_name}/{repository_name}"')
        populate_repository(
            organization_name,
            github_username,
            fg_pat,
            repository_name,
            input_data.relative_file_paths
        )


def main() -> int:
    console.clear()
    greet()

    organization_name = request_organization_name()

    console.clear()
    fg_pat = request_fg_pat(organization_name)
    github_username = get_github_username(fg_pat)

    console.clear()
    all_repository_creation_data = create_repositories(
        organization_name,
        fg_pat
    )

    handler_context = HandlerContext(
        organization_name,
        fg_pat,
        all_repository_creation_data
    )
    
    browser_flow(handler_context)

    console.clear()
    
    create_repository_variables(organization_name, fg_pat, handler_context)
    create_repository_secrets(organization_name, fg_pat, handler_context)
    create_github_pages_site(organization_name, fg_pat)
    populate_repositories(organization_name, github_username, fg_pat)

    return 0

if __name__ == '__main__':
    exit_code = main()
    sys.exit(exit_code)
