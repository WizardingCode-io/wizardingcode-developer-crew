# Job or listener

A queued job or an event listener. The kind where the retry budget, the failure path and the transaction boundary get forgotten because the happy path ran once.

## Assumed by good practice
- The job implements `ShouldQueue` and states its attempts, backoff and timeout as `#[Tries]`, `#[Backoff]`, `#[Timeout]` and `#[FailOnTimeout]`; what happens after the last attempt is written down.
- Dispatched with `afterCommit` when it reads rows the transaction writes; a listener that needs the commit implements `ShouldQueueAfterCommit`.
- Models are passed as models, serialised by `Queueable`, never as arrays copied out of them.
- Running it twice leaves the same result as running it once.
- Tested with `Queue::fake()` and `Queue::assertPushed(…)`, `Event::fake()` and `Event::assertDispatched(…)`; the listener is found by discovery from `app/Listeners` and appears in `php artisan event:list`.

## Decisions only the user can make
- Which queue connection and queue it runs on (the `database` connection is the default in a new application) and what a retry or a delay costs the user.
- What a permanent failure does: notify, compensate, or leave for a person.

## Proposals
- `JobAttempted::$exception` read as the exception or null, not as the former boolean.
- A timeout below the worker's, and a chain where the order of jobs matters.

## Warnings
- A job that captures a request, a session or a closure.
- A listener registered twice, by discovery and by hand.
- A failure retried without end and without a record.
