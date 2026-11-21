# Paid executor: readable provider errors, longer answers and a wait before a retry — PRD

Beads epic: `oferty-pracy-opn`. Details: [requirements](requirements.md), [solution design](solution-design.md). Terms follow the AI module section of the [glossary](../../../GLOSSARY.md#ai-module).

## Context

The epic [AI assignments](../sq2-zlecenia-ai/PRD.md) (`oferty-pracy-sq2`) gives the owner a panel of assignments and one way for modules to hand work to AI. On 21 November 2026 a [research](../../research/openai-integracja-wzorcowa.md) compared the paid executor's integration with OpenAI's current documentation and with what the community reports. The owner went through its conclusions the same day and chose the ones this epic delivers. The research is evidence of what the provider documented on that day; the decisions are the owner's.

## Problem

- **An answer can end empty and still cost.** The paid model spends the same allowance on its reasoning as on its answer. Today's allowance is a quarter of what the provider suggests to start with, so an assessment or a company research can end incomplete with its cost charged, and a retry ends the same way. The research inferred this from the documentation; no such end has been observed in the application.
- **A complete answer can be thrown away.** The paid executor accepts an answer only when its text arrives in one part. The provider may send it in several.
- **The owner cannot tell why an operation failed.** The panel shows one general cause for every error answer of the provider. A passing overload and an exhausted account balance look the same, so the owner cannot tell whether Retry can help. No identifier of the request is kept, so an operation cannot be looked up at the provider.
- **An exhausted balance wastes retries.** With no funds at the provider, every automatic operation fails the same way, yet all three are used before the owner is asked.
- **A short outage uses up all retries.** The three automatic operations of an assignment follow each other at once. A provider that is overloaded for a minute fails all three within seconds, and the assignment needs the owner although nothing was wrong with it.

## Goal

- An answer of the paid executor has the room the provider suggests, and an answer in several parts is read whole.
- For an operation the provider answered with an error, the owner sees in the panel what the provider said and the identifiers of the requests.
- An assignment that fails because the provider's account has no funds asks for the owner at once, with the reason visible.
- After the provider reports that it is temporarily unavailable, the next automatic operation waits before it starts, and other assignments are not held back by that wait.

## What changes for the owner

- **Held amount.** The amount held while a paid operation runs rises from about 0.27 PLN to about 0.31 PLN for a single answer and from about 0.42 PLN to about 0.53 PLN for an agent session. A month's 100 PLN then covers at least about 320 assessments instead of about 370. The actual cost of an operation does not change.
- **Assignment details in the panel.** A failed or uncertain operation shows the provider's error code and message and the request identifiers. A waiting operation whose start is put off shows the moment before which it will not start.
- **Exhausted balance.** The assignment moves to needs attention after its first operation. With many assignments waiting, each one moves there in turn and is retried one by one after the owner tops up the provider's account; bulk actions stay put off.
- **Wait before a retry.** After a rate limit or a server error of the provider, the next automatic operation starts after the time the provider names, at most 15 minutes, or after 1 minute and then 5 minutes when the provider names none.

## Out of scope

- The price list's rates. The research found two cases in which the provider charges more than the price list assumes (writes to its prompt cache and very long requests). The owner accepted the possible difference on 21 November 2026.
- A spending limit at the provider. The owner set it in the provider's own settings.
- The time limits of a request and the maximum run times of the paid executor.
- Holding back every assignment of an executor while its provider is unavailable. Each assignment waits on its own.
- A wait for the local executor, and a wait after failures other than a rate limit or a server error.
- Showing the raw response in the panel, and bulk actions (`oferty-pracy-sz5`, items 33 and 13).
- The other recommendations of the research that it rates as not worth it at this scale, and the provider's discounted background mode, which the research records as an open product question.

## Success

- A single answer and each step of an agent session are sent with room for 25,000 output tokens.
- An answer whose text arrives in several parts gives a result.
- For an error answer of the provider, the assignment's details show the provider's code and message and the request identifiers.
- An assignment whose operation fails for lack of funds at the provider needs attention after that one operation, with nothing charged.
- With a provider that answers with a rate limit once, an assignment's second operation starts after the wait and can succeed, while another assignment of the same executor is carried out during the wait.

## Constraints and dependencies

- The epic follows `oferty-pracy-sq2`: it changes the paid executor after the old way of requesting AI work is removed, and it shows its data in the panel that epic builds.
- It takes up item 10 of the collection task `oferty-pracy-sz5` (a delay between automatic retries) and replaces, for the failures named above, the rule of `oferty-pracy-sq2` that the next automatic operation is added with no delay.
- It adds one option to the shared way of requesting background work of `oferty-pracy-2ba`: a job that is not carried out before a given moment.
- The rules stay the same for every executor: an executor reports that its provider is temporarily unavailable, and the wait is the AI module's common rule.

## Risks the owner accepted

- **More money held per running operation**, as given above.
- **Each assignment needs its own Retry** after the provider's account ran out of funds.
- **An interrupted operation keeps no request identifiers**: they are saved when the operation ends.
- **A very long answer can pass the time limit of its request**, which stays at 90 seconds for a single answer and 120 seconds for a step of an agent session. Such an operation fails with an unknown cost, its potential cost stays charged, and it is retried. The owner kept the limits on 21 November 2026; they are raised separately if such failures appear in the panel.

## Stages

| Stage | Task |
| --- | --- |
| Longer answers and readable provider errors | [opn.1](requirements.md#t1) |
| A wait before an automatic retry | [opn.2](requirements.md#t2) |
