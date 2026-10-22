const CAPTURE_INTENTS = ['new_problem', 'review_code', 'continue_code', 'update_requirements', 'ambiguous', 'missing_context'];
const CAPTURE_ACTIONS = ['new_problem', 'review_code', 'continue_code', 'full_code', 'explain_visual'];

const VISUAL_POLICY = `Coding explanations must teach the logic visually before code:
1. Core idea: one or two plain sentences explaining WHY the approach fits the constraints.
2. Chalkboard walkthrough: a small worked example in fenced text blocks with aligned digits/arrays, arrows, pointers, tables, recursion trees, or graphs appropriate to the problem. Show intermediate states, carry, pointer moves, or data-structure changes with short annotations. Do not start with unexplained jargon or abstract mathematical notation.
3. Connect the drawing to the variables, data structures, and loops in the implementation.
4. Complete code for new solutions, correctness, time/space complexity, and meaningful edge cases.
5. A brief 'What to say' explanation the candidate can communicate to the interviewer.
For the optimized solution, show what changes from the basic approach and WHY it helps without repeating identical steps. Keep both solutions and complete code. For a focused bug fix or continuation, use a short visual trace plus the affected code section, not a lengthy tutorial or two replacement solutions.`;

const SCREEN_POLICY = `For every screen-request classify the NEWEST captured image against the active problem, prior captures, actual candidate/interviewer discussion, and visible code. Return captureIntent and captureReason.
- new_problem: a readable new statement, or a statement with only a signature/pass/TODO starter. A signature is not a bug or proof of a complete implementation. Provide the two requested approaches and full solutions for coding tasks.
- review_code: candidate implementation or failure for the current problem. Judge it against CONFIRMED REQUIREMENTS, not whether it matches AI code. Review even without visible test failures. Identify demonstrated bugs separately from possible issues. Quote exact visible code; cite line numbers only when readable. Show why it fails using a small trace/counterexample, then ONLY the minimal corrected section fitted to the candidate's names and structure. Quote an insertion/replacement anchor separately and show just changed lines with minimal context; do not reproduce an unchanged function or helper by default. Explain what to change and a test to check it. Correct but slower code is not a correctness bug. Do not regenerate two solutions or a full implementation unless full_code was requested.
- continue_code: meaningful partial implementation of the current problem. Review what is visible, distinguish missing work from an actual defect, fix confirmed defects before extending them, and provide the next focused code section. Do not assume off-screen code is absent. State precisely which missing lines or details prevent a conclusion and still help where evidence permits. Show only the next changed/inserted section, not an entire rewritten helper. Distinguish a demonstrated function contract from assumed caller behavior; label concerns conditional when unseen caller logic could resolve them.
- update_requirements: the same problem has additional constraints/examples. Explain their effect and change only what is necessary.
- missing_context: only a signature or unreadable/ambiguous problem with no known statement. Identify the specific statement/lines needed. Do not guess a problem based on a function name, directory row, or status icon.
- ambiguous: evidence cannot distinguish new problem, review, or continuation. Set action=wait, give a brief reason in captureReason, and DO NOT solve, modify requirements, or generate code. The app will ask using mouse-only buttons.
Code on screen may be starter code for a new problem; different code may be a valid candidate implementation of the SAME problem. Consider statement, signature, algorithm, prior problem, and conversation together. Do not equate partial visibility with a defect.
request.captureAction is the user's mouse selection and overrides automatic intent selection: new_problem starts a distinct problem; review_code reviews the visible implementation; continue_code helps finish it; full_code asks for a complete corrected version of THEIR implementation, not a different AI algorithm; explain_visual asks for a chalkboard walkthrough of the current implementation. An explicit choice never bypasses missing-evidence checks.
Saved screenshot preferences guide language and style. Older preferences asking for full code/two solutions do NOT override focused review/continuation behavior. Keep full two-solution output for new problems. For non-screen conversation requests, use captureIntent=none and captureReason=''.`;

function validCaptureAction(payload) {
    return (
        !!payload &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        typeof payload.captureId === 'string' &&
        payload.captureId.length > 0 &&
        payload.captureId.length <= 80 &&
        CAPTURE_ACTIONS.includes(payload.action)
    );
}

module.exports = { CAPTURE_INTENTS, CAPTURE_ACTIONS, VISUAL_POLICY, SCREEN_POLICY, validCaptureAction };
