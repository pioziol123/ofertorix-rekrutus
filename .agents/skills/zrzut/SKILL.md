---
name: zrzut
description: Drop a thing to check or fix later into the project's collection task, so nothing gets lost. Use when the owner says "zapisz do sprawdzenia", "dorzuć do zrzutu", "żeby nam nie uciekło", "zanotuj do poprawy", or when you notice something worth checking or fixing that is outside the current task's scope.
---

# Zrzut

The collection task `oferty-pracy-sz5` holds things to check or fix that nobody is working on yet. It carries the `ready-for-human` label, so the runner never takes it. One numbered item in its description is one thing. An item is a note, not a task: before anyone works on it, it gets prepared as a task of its own.

## Adding an item

1. Read the current description: `bd show oferty-pracy-sz5`. If the task is closed or missing, find the collection task with `bd list --label ready-for-human --status open` and ask the owner which one to use before writing.
2. Check that the thing is not already listed. If it is, extend that item instead of adding a new one.
3. Append one item with the next number. Write it in Polish, in domain terms first (who is affected, what goes wrong or what is unknown), then:
   - where it came from: the task id, commit or conversation, and the date (YYYY-MM-DD);
   - what exactly to check or decide, concrete enough that someone without this conversation can act on it;
   - where the details are: bd comments, documents or files.
4. Write the whole description back with `bd update oferty-pracy-sz5 --body-file <file>`. Keep every earlier item word for word; renumber nothing.
5. Tell the owner in one or two sentences what you added and under which number.

## Rules

- Do not fix the thing, create a separate task for it, or change its priority. Collecting is the whole job.
- Do not commit, push or run Dolt sync for this.
- An item that blocks the current work does not belong here; raise it with the owner directly.
