# Indeed salary origin — solution design

Status: design of the selected feature, 2026-11-02. Basis: [requirements R-P01–R-P05](requirements.md), JobSpy base `68b88d6909a2342ad75fbb945c4204a3a7ed6665`. The code lives in the separate local repo `.local/JobSpy`; the paths below are relative to it.

## Approach

We extend `Compensation` and `JobPost` in `jobspy/model.py` with two fields. `get_compensation` in `jobspy/indeed/util.py` determines the origin at the point where the amount is chosen. The existing `_process_job` carries them through by unpacking `model_dump()`, without rebuilding the adapter or the `scrape_jobs` interface. We add no network calls.

## Contract of the addition

| Field | Value and semantics |
| --- | --- |
| `salary_origin` | Literal `employer`, `portal_estimate`, `unknown`; `unknown` by default, never null. Describes the chosen amount, not the mere presence of raw data. Without an extracted amount: `unknown`. |
| `salary_evidence` | JSON object or null; a copy of the part of compensation normalised by the model: `baseSalary`, `currencyCode`, `estimated`. Keeps both sources, including an unsupported period. This is data after JobSpy validation, not the full raw HTTP response. Empty fields alone do not create evidence. |

`salary_source` remains the existing field for the extraction method (`direct_data`/`description`). Its `direct_data` does not confirm the employer. The existing serializer used the truthiness of the number to detect a salary; we change this condition to a null check, so that it does not treat zero as missing (R-P02).

`salary_evidence` is a plain JSON object, not a nested model left in the DataFrame. The existing serializer keeps dictionaries; the full JSON export is to keep the structure. The old flat fields and the selection of the base amount do not change, apart from treating zero correctly. Adding columns is a deliberate additive change; clients that need the exact old column list should select the old fields explicitly.

Annualisation works on a copy of the flat amounts; the evidence is not converted. A missing recognised period results in empty computed amounts and `unknown`, keeping the source evidence. In that case we do not silently switch to another kind of salary.

## Verification and release

The tester will prepare standard `unittest` tests: unit tests of selection and evidence (R-P01–P03), of the adapter, and of the full path through `scrape_jobs`/export and annualisation (R-P04), with the network blocked (R-P05). Ruff and mypy will cover the code. CI will run the offline tests in a matrix of supported Pythons. We do not require a Postgres migration or running the application's importer.

Test results and status are kept in Beads `oferty-pracy-y81`. This pair documents a specific change, and further features will get separate pairs. Releasing/connecting the application will be a later step; we do not publish changes automatically.
