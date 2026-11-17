# Indeed HTML scraper — solution design

Status: design of the current stage, 2026-11-02. [Requirements](requirements.md). Agreed constraints: HTML, Poland, a limit on all HTTP, no circumventing blocks. Below are implementation choices within the ordered scope, not additional product requirements.

## Adapter boundary

The new module `jobspy/indeed_html.py` provides `collect_indeed_html(IndeedRequest) -> RunResult`. We do not replace the collect_indeed function or the upstream Indeed class. The runner imports the new function under the existing local alias collect_indeed, keeping the shared lock and JSON. The application changes adapterVersion from 1 to 4 for Indeed; the query content, schema_version=1 and fork_revision=oferty-contract-1 stay compatible. The new fingerprint distinguishes HTML observations from the previous configuration. Other sources unchanged.

## Parsing and transport

BeautifulSoup reads cards by data-jk and viewjob?jk links, and details by jobDescriptionText and JobPosting from application/ld+json (including @graph). We do not execute JavaScript. We do not try to guess arbitrary JS variables: their absence, with no cards and no explicit empty marker, is page_error/parser_error. This is a deliberate limitation of the first parser.

Lists are requested at pl.indeed.com/jobs with the q/l/start parameters and the request's available filters. The next page follows from an explicit next link; only HTTPS, the exact host pl.indeed.com, and the paths /jobs and /jobs/ are allowed. Details always come from a constructed /viewjob?jk=ID; the ID may contain only letters/digits/_/-. We do not fetch URLs found in descriptions/JSON-LD. A set of visited pages and IDs stops looping. An explicit absence of results is completed/exhausted; the absence of recognisable HTML is failed or partial/page_error.

ControlledRequests covers all GETs and retries, disables redirects, and respects Retry-After and the limits. An additional shared runner lock keeps serialisation between processes on the same volume. A block/consent page in an HTTP 200 is detected before the parser; 403 and redirects are a stop, not something to circumvent. The detail limit keeps the remaining already-read cards without descriptions.

JobPosting maps title/hiringOrganization/description/jobLocation/datePosted/jobLocationType. A plain text location is kept as city with an undetermined structure. Without an explicit TELECOMMUTE, is_remote=null. Seniority/skills stay null. Salaries only from the baseSalary/estimatedSalary structures, finite non-negative numbers and a recognised unitText. The evidence keeps the source field; baseSalary does not on its own confirm employer authorship. The HTML description is converted to text, without executing the content. ISO dates are validated; unknown ones are not guessed.

## Output, release and verification

RunResult/structured_job are the authoritative contract. Stop reasons and warnings follow R-I05; a missing description forces partial. An unexpected error does not expose the response/secrets and keeps the collected records. The new wheel in integrations/jobspy, the manifest/hash and the local fork version are updated together; the worker image is installed from the package, not from the .local checkout.

Offline tests with synthetic HTML and a transport controlled by the existing limiter cover R-I01–06. A separate tester owns only the tests/fixtures. Python and TS checks, the runner test and the worker build verify R-I07. The pilot after the build: at most 10 HTTP/90 s/2 s gap; on 403 no further attempts. Enabling the source requires a successful pilot; with the current block the configuration stays disabled. There is no automatic GraphQL fallback.
