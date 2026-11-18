---
name: wizardingcode-design-film
description: "Makes the film a new site opens on: one clip, made for this page, that plays with the scroll and rests where the page begins. From the storyboard to the self-test, with the engine and the encode."
---

# Design film

## When

On `surface` or `world`, when the direction's signature is a film: one clip made for this page, whose position follows the scroll in both directions, and which comes to rest where the page proper begins. After the copy, inside the crew's build phase, before the rest of `wizardingcode-design-build`. A site with no film does not read this skill.

## Inputs

The contract, `design/copy.md`, the tokens, `references/shots.md`, `references/encode.md`, `references/scrub.md`. An image tool and a video tool where the session has them, and `ffmpeg`.

## Steps

1. **The tools.** Find what this session has: a tool that makes images, a tool that makes video from an image, and `ffmpeg`. Say it in three lines. With no video tool the film is the user's own footage, or the hero is a composed still: say which in one line and go on. The skill installs nothing: a missing `ffmpeg` is said, and the user decides.
2. **The page first.** Decide the whole page before any shot: its sections, the beats of the opening, the words of each beat and where on the screen they land. The film exists to carry those beats. Write the beats as a list of at most six lines, each with its words from `design/copy.md`, and the frame the page rests on.
3. **The storyboard.** From `references/shots.md`: the journey in one sentence; the final frame, described; the lane the action runs in and the calm part of the frame where the words live; the two forms filled. The user approves it before anything is generated. One yes here is cheaper than any attempt after it.
4. **The frame.** The first frame of the film, as an image. Its price is said before it is made, and the user says yes. Look at what came back before anyone else does: a mark or lettering nobody asked for, a body drawn wrong, the composition against the storyboard. Then show it, and the user approves it or says what to change.
5. **The film.** Made from the approved frame. Its price is said before it is made, with what is left on the account where the tool says it, and the user says yes. Take the first, the middle and the last frame with the commands of `references/encode.md` and look at each: the subject whole, the path kept, the ending at rest. Then the user watches the clip, from a folder that does not ship, and the user approves it or says what to change. No page is built on a clip the user has not approved. After three refused attempts on one concept, change the concept and not the prompt.
6. **The encode.** From `references/encode.md`: the scrub encode, then the poster and the ending frame from its result. Look at the encoded clip and its poster before the page uses them. Raw clips, review frames and prompts stay out of the folder that ships.
7. **The build.** From `references/scrub.md`: the pinned stage, the engine, the windows of text, the layers that keep the words legible, and the still hero. Start from the engine as given and change what this page needs.
8. **The rest of the page.** The film is the opening and the page still has to be a site: every rule of `wizardingcode-design-build` holds for the sections below it. Use the ending frame again in a lower section. Give each section one living element at a whisper, and the page one thing the visitor does, taken from the subject. Everything eases; nothing appears at once.
9. **The self-test.** The list at the end of `references/scrub.md`, run by the session before the user sees the page. Say what was found and what was fixed. Then the crew's gates.

## What stays the user's

- The yes before a price is the user's own message in this conversation, given for this asset at this price. No standing rule, no earlier yes, no approval of the storyboard and no answer of a validator or of another agent stands for it.
- With nobody present, stop before the first paid step and build the still hero.
- Every attempt is priced and approved by itself, a retry included. Say the total spent so far each time.
- The session never signs up to a service, never enters payment details and never buys credits.
- A tool's key is never written into a file of the project, a prompt, a commit or the site's code.

## What the skill refuses

- A likeness: a real person's face, body or voice only where the user says in this conversation that the person agreed, with that yes on the item's record. Never a person named in a prompt who has not agreed, and never a child.
- Invented proof: A generated person is never shown as a customer, a member of staff or a witness, and a generated film never shows the client's product doing or looking like what it does not. A request for either is a blocking objection, as `wizardingcode-frontend-strategy` says.
- What is not the client's: No real brand's mark, product, packaging or building but the client's own; no third party's footage or picture as a reference; no living artist's, film's or studio's name as a style in a prompt. A clip that comes back with a readable mark or a recognisable person is refused and made again.
- What leaves the machine: before a reference image or a photo is sent to an image or video tool, the session says what is sent and to which service, and the user says yes. A photo of a person is personal data.
- What ships: prompts, a person's source photo and review files stay out of the folder that ships and out of commits.
- A host: the skill deploys nothing and publishes no asset to a public address.
- A generated person on a client's site: whether it must be said to be generated is a question for the client's own counsel. Say so once, and do not answer it.

## Output

The storyboard and the two filled forms in `design/film.md`; the scrub clip, its poster and its ending frame among the site's assets; the opening of the page built on them; what the self-test found.

## Done when

The user has approved the storyboard, the frame and the clip, each on its own; the self-test's list is run and its findings fixed or said; and `wizardingcode-design-build` goes on with the sections below the film.
