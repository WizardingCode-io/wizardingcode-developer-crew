/**
 * The verdict's reasons that a gate run answers, in the words the verdict prints them. They are
 * written here once because two modules need them: the verdict that says them and the way into
 * Learn that tells them from the reasons a gate run does not answer (finding 242's item).
 */
export const GATES_NOT_RUN = "gates have not run";
export const CODE_CHANGED = "code changed since the last gate run";
/** The end of a gate's or a ruling's reason when its record is of other code. */
export const NOT_ON_CURRENT_CODE = "not run on the current code";

/** Whether a reason of the verdict is about the code: the tree moved since the proof, or no run vouches for it. */
export function aboutTheCode(reason: string): boolean {
  return (
    reason === CODE_CHANGED || reason === GATES_NOT_RUN || reason.endsWith(NOT_ON_CURRENT_CODE)
  );
}
