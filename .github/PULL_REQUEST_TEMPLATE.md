<!--
Thanks for the PR! A few things make review faster:
- Keep the scope tight
- Add a screenshot/recording for UI changes
- Note any DB/API breakage
-->

## Summary

<!-- One or two sentences: what changed and why. -->

## Changes

<!-- Bullet list of the meaningful changes. -->

-
-

## Screenshots / recording

<!-- For UI changes. Light + dark mode if applicable. -->

## How I tested

<!-- The actual steps you ran. "Clicked around" doesn't help. -->

- [ ] Ran `pnpm dev` and walked through the affected flow
- [ ] `pnpm -F @ipe/client exec tsc --noEmit` clean
- [ ] `pnpm -F @ipe/server exec tsc --noEmit` clean
- [ ] `pnpm contracts:test` green (if contracts touched)
- [ ] Tested on mobile viewport (if UI)

## Breaking changes

<!-- DB schema? API contract? Env vars? Mark with [BREAKING] in the title. -->

## Related

<!-- Issue numbers, design docs, discussion threads. -->
