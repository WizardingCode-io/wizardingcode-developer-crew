# Upload

A file from the outside enters the system: images, documents, imports, attachments.

## Assumed by good practice
- Type and size limits; the type sniffed from the content, never trusted from the extension; stored outside the web root or behind a private ACL, under a random name.
- Scanned where the project has a scanner; served through the application's own permission check.

## Decisions only the user can make
- Maximum size and the accepted types; who may see the file afterwards; how long it is kept.

## Proposals
- Direct-to-storage with a signed URL when the project already uses object storage; thumbnails and conversions as a job, not in the request.

## Warnings
- Including, executing or rendering uploaded content as code or markup; serving a file under its original name; a public bucket "for now".
