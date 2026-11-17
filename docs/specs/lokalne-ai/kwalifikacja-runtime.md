# Runtime and Chrome isolation qualification

Status: **specification ready for execution by an agent**, 2026-11-05. Beads `oferty-pracy-334.21`. This is part of preparing the integration, without live tests having been run. Product contracts: [LA-07–21](requirements.md); technical: [runtime](kontrakty-runtime.md). The task is not an LLM quality benchmark or consent to a global installation.

## Goal and dependencies

Before stages 7/8, establish a reproducible set of versions and check properties that the API alone does not guarantee. Protocol/isolation trials may use a synthetic session, model mocks and controlled test pages. They do not need an implementation of the whole research. The integration gates T02 and T05 remain in stages 5/8 and 7/8 respectively; the qualification does not replace them.

Stage 7 depends on 5 and on this task; stage 8 on 4/5/7. Stages 1–6 can be implemented without the browser qualification result. A required protection that does not work blocks public research; it does not justify lowering LA-09.

## KR-AC01 — Versions and contracts

Starting point for checking (not a declaration that the whole set is compatible):

| Dependency | Base version | Source checked 2026-11-05 |
| --- | --- | --- |
| Ollama | 0.40.14 | [release](https://github.com/ollama/ollama/releases/tag/v0.40.14), [chat types](https://github.com/ollama/ollama/blob/v0.40.14/api/types.go). |
| OpenCode | 1.19.5 | [release](https://github.com/anomalyco/opencode/releases/tag/v1.19.5), [SDK types](https://github.com/anomalyco/opencode/blob/v1.19.5/packages/sdk/js/src/gen/types.gen.ts); the authoritative contract of the running version comes from /doc. |
| chrome-devtools-mcp | 1.12.0 | [release](https://github.com/ChromeDevTools/chrome-devtools-mcp/releases/tag/chrome-devtools-mcp-v1.12.0), [configuration](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/chrome-devtools-mcp-v1.12.0/docs/configuration.md). |
| Google Chrome for Testing, unified headless | 157.0.8103.38, Linux x64 | [Official Stable manifest](https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json), read 2026-11-05. The qualification implementer persists the image/binary and its hash. |

Result: the designed `config/local-ai/runtime-lock.json`, schema version 1, exact versions and platform/architecture, source and SHA-256 of binaries/packages/image, a digest of /doc and of the tools/list schemas, context parameters, security configuration and results. Do not enter fictional digests now. Start-up checks the real version; a version change needs the relevant trials to be repeated, not a silent update through `latest`/`npx -y ...@latest`. The manifest contains no secrets.

T01: check health and /doc, create/list with correlation and directory, a durable message ID, a lost response after start/resume, reading messages and no assumed idempotency. A model mock is enough; if the real runtime needs a technical inference to prove the protocol, use synthetic input, without the owner's data and without quality assessment. Do not record PASS on the basis of a generated SDK type alone.

## KR-AC02 — Choice and proof of network isolation

**Technical design chosen after the owner's suggestion:** headless Chrome in a container, reachable for Chrome DevTools MCP through a private channel. Preview and manual intervention in the same session through the ready-made DevTools frontend. We do not run a native Chrome for the agent's work and we do not change the network of the personal macOS. We keep the functional requirement of manually handling a block; we do not drop intervention just because Chrome runs without a window. The qualification is to confirm that this preview works, without a guarantee of solving any CAPTCHA.

Variant to qualify: a dedicated Linux container for Google Chrome in the new headless mode (not the old headless-shell). On Apple Silicon, the base Linux x64 may need Docker emulation; record the platform and the technical limitations, and do not silently download a different image or Chromium. Preview through a private DevTools is available only to the owner. The browser and its network processes have a separate network namespace with traffic denied by default; the only web data egress goes through a controlled proxy. The proxy resolves DNS and connects only to a checked public address; it rejects localhost, private, link-local, multicast, reserved and metadata addresses, also IPv4-mapped IPv6. The check and the connect use the same IP, without another independent DNS lookup after validation. CONNECT only to public HTTP(S), without access to the proxy's administrative endpoints. Each new connection/redirect is checked; no proxy blocks the network.

The MCP/CDP control channel and the display channel must be separated from page access. A pipe/Unix socket or a separate network for the controlling process is preferred; do not open an exception for the browser to the whole host/DB/Ollama/OpenCode. Loopback and the CDP/VNC port are part of the test: an internal Docker network alone does not block the container's loopback. If the chosen MCP launcher does not support such separation, first solve this technically in the qualification; do not pretend to have isolation on the basis of Chrome flags.

Chosen enforcement mechanism: nftables rules inside the container's dedicated network namespace, covering IPv4/IPv6 as well as loopback and all Chrome processes under a dedicated UID. Default deny for new connections; the only outgoing exception is the proxy IP/port; established/related allows responses to the trusted incoming CDP connection. There is no exception for host.docker.internal, the DB, OpenCode, Ollama or the local CDP port. The launcher sets the rules before Chrome starts, checks that they are present and drops privileges. Chrome runs without CAP_NET_ADMIN and as an unprivileged user with the sandbox; a missing sandbox is not bypassed with the --no-sandbox flag. The container has no docker.sock and no private directories of the owner. Changing the rules needs a trusted launcher, not a model tool. A proxy argument or URLBlocklist alone is not a protection.

[Chromium describes](https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/proxy.md) implicit proxy bypass for loopback/link-local. This confirms why the proxy flag alone is not proof of isolation. Flags are an additional setting; traffic enforcement does not depend on the page behaving correctly.

T04 minimum trials, also observed on the target server side: a private URL, host and container loopback, IPv6, IPv4-mapped IPv6, DNS rebinding, redirect, iframe, image/script/CSS, service worker, WebSocket, WebRTC/UDP and an attempt without the proxy. Also check access to administrative ports, file URLs, proxy failure and a new tab/pop-up. For a forbidden target, the connection/request counter must stay at zero. The tests use controlled endpoints and an isolated network; they do not scan the owner's network. A plain UI error without network observation is not enough.

## KR-AC03 — Contexts, permissions and persistence

T03: two consecutive execution IDs have separate directories, configuration and Chrome; resuming the same one keeps cookies/tabs. The bridge context is immutable; after losing generation it does not start a new action. An attempt to use another execution's tab/ID, a leftover bridge, and the default file/bash/delegation tools must be technically rejected. The way processes are ended and disposal does not remove the session or the archive.

OpenCode: separate data/config/cache directories and an environment without personal accounts, keys, plugins and MCP. OPENCODE_CONFIG_DIR alone is not isolation — the [documentation](https://opencode.ai/docs/config/#custom-directory) describes it as an additional configuration layer. The test checks that nothing is inherited. Do not modify the owner's HOME; use a separate account/environment and the proper XDG directories. Disable automatic updates, sharing, delegation, the other tools, automatic JSON repair and implicit input reduction; check the necessary parameters in the pinned version, and do not guess names.

## KR-AC04 — Result, instructions and failure handling

Deliver the manifest, the project configurations/launchers, test scenarios and the report `docs/specs/lokalne-ai/kwalifikacja-wynik.md` with evidence, reproducible instructions and real limitations. Do not create a success report before the tests. The exact digests/config can be created only while the task is being carried out. We do not need our own Chrome engine or agent.

If a service/permission is missing or a test is negative: the result is BLOCKED/FAIL with the specific scenario, the task stays open and blocks 7/8. If a scope change is needed, go back to the owner with the specific result and a variant. Recording a blocker alone does not meet the closing criterion. Reading the official documentation during preparation does not prove that the versions work locally.

## Headless channel and manual intervention

Chrome is started with an explicit profile per execution and a debugging port in the private control network. Chrome DevTools MCP 1.12.0 connects through `--browser-url` or `--ws-endpoint`; it does not use autoConnect. The [reference of the pinned version](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/chrome-devtools-mcp-v1.12.0/docs/configuration.md) describes both transports. The bridge still filters tools/list and tools/call, and archives the result before the model. It gets no permissions to the personal Chrome.

The control channel gateway has a separate credential, Origin verification and the existing application's authorisation for the owner's preview; do not publish raw CDP on host interfaces or on a public network. Chrome's own private port may be reachable only from the controlling container. Pages rendered by Chrome must not open a new connection to this port — the OUTPUT rules for the Chrome UID also block loopback. Test T04 must show this; it must not rely only on the browser's own protection against local network access.

After request_intervention, the model takes no further actions. The panel gives the owner an authenticated link to the ready-made DevTools with preview/input of this specific tab, without building our own interaction engine. After solving it manually, the owner chooses "Wznów" (Resume). Cookies, target ID, execution ID and session stay the same. A missing preview/lost tab is an explicit error, not a new session. The scope of intervention stays public, without signing in.

[Chrome describes unified headless](https://developer.chrome.com/docs/automation-and-testing/headless), and [DevTools describes remote connection to another instance and switching input](https://developer.chrome.com/docs/devtools/remote-debugging/local-server/). This is the basis of the design; a working preview/input from the container, WebSocket routing and permission protection must be confirmed on the pinned set. If the ready-made DevTools cannot handle the required intervention, the qualification result is FAIL/BLOCKED; do not replace it with a screenshot alone and do not remove PZ/LA-15.

The manual preview is made available only to the owner, for a pending intervention, bound to the execution/target and with a time-limited credential. Before resume, close manual control access, so that the user and the model do not act in parallel. The owner's DevTools must not be used to bypass Chrome's network protection. Reads made during intervention are still subject to source control and archiving before being used as evidence.
