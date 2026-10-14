# Auth

A login, a session, a permission, a role: who may do what. Also any change that grants or widens.

## Assumed by good practice
- Passwords through the project's hasher; sessions and tokens revoked when the password, the permission or the account state changes.
- A limit on failed attempts; error messages that do not say whether the user exists; the check in one place, never only in the UI.

## Decisions only the user can make
- Who holds the new permission, and whether existing users get it by default (the default is deny).
- Session length, second factor, and whether an admin can act as a user.

## Proposals
- An audit line per grant and revocation, naming who granted; a single policy or gate the routes share.

## Warnings
- A permission granted "to everyone for now"; a check only in the client; a password, token or reset link that passes through a URL that gets logged.
