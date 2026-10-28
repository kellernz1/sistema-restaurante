# Installed project design skills

Installed on 2026-10-28 (America/Sao_Paulo), on branch `redesign/ui`, after explicit approval. This is a content-only, project-scoped installation under `.agents/skills/`; no global skill installation, plugin registration, symlink or executable helper was used.

## Pinned sources and licenses

| Content | Repository and revision | License | Installed location |
| --- | --- | --- | --- |
| design-taste-frontend, including its integrated redesign workflow | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill/tree/12af471f627f866411b4bd785b19646d3672784c), `12af471f627f866411b4bd785b19646d3672784c` | MIT; upstream LICENSE preserved | `.agents/skills/design-taste-frontend/` |
| web-design-guidelines | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62), `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` | MIT declared by upstream README; that repository has no separate LICENSE at this revision | `.agents/skills/web-design-guidelines/SKILL.md` |
| Frozen Vercel rules and their license | [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines/tree/434b7f91364665f2f733b310ec54809bf8f37937), `434b7f91364665f2f733b310ec54809bf8f37937` | MIT; upstream license copied as LICENSE-guidelines | `.agents/skills/web-design-guidelines/command.md` |
| IBM, Cal and Linear design references | [voltagent/awesome-design-md](https://github.com/voltagent/awesome-design-md/tree/3b605329240ce735b510037cca322f1831fdd7f8), `3b605329240ce735b510037cca322f1831fdd7f8` | MIT; upstream LICENSE preserved | `docs/design-references/{ibm,cal,linear.app}/DESIGN.md` |

## Review and integrity

Stage 1 statically reviewed all files in the selected upstream skill directories, including script I/O, subprocess/browser behavior, network sources, environment/secret-related instructions, references and metadata. Stage 2 rechecked both cloned commits and every file SHA-256 against the temporary review inventory before installation. No third-party skill script or installer was executed. Downloaded files were addressed by the approved commit and their bytes verified against the GitHub Git blob SHA-1, then SHA-256 checksummed.

The Taste LICENSE checkout has CRLF while its canonical Git blob has LF; Git-filtered hashing verified the same canonical blob before copying. Its checkout bytes were preserved. Taste SKILL.md and its 11 Markdown references are unchanged. The reference DESIGN.md files and frozen command.md are byte-for-byte copies of their pinned Git blobs. Hashes below describe the installed bytes, without Git line-ending normalization.

## Intentional omissions and local changes

- Taste: copied only SKILL.md, the 11 text references under references/, and LICENSE. Omitted scripts/ (all .mjs helpers), all JavaScript/CSS assets, library/ JSON data, evals/, README files, install.sh, examples, images and plugin/marketplace metadata. No automatic downloader, browser launcher, static server, profile cleanup or home-directory history writer was installed.
- The unchanged Taste instructions and references still mention draw.mjs, inspect.mjs, lint.mjs, scenes.mjs, assets.mjs, library data, motion assets, remote fonts and example commands. These dependencies are deliberately absent. Do not install, fetch, recreate or run them to satisfy the upstream workflow; do not claim their gates passed. Follow AGENTS.md and the project's existing authorized verification workflow instead. Page-marketing motion/image requirements do not apply to operational screens.
- Vercel: changed the SKILL.md workflow and source instructions to read the adjacent local command.md, never fetch the latest rules or use WebFetch. Preserved the name/description/metadata and review purpose. The original SKILL.md SHA-256 was `17e48da905f83a19c174079b50760a98c069527ba50079239b3c187236627c29`; the modified installed hash appears below. command.md itself was not edited. Its English editorial, CDN, form and other generic suggestions are advisory and subordinate to AGENTS.md.
- image-to-code and the other imagegen-skills were not installed. No standalone redesign-existing-projects skill was added; redesign is integrated into design-taste-frontend at the pinned revision.
- No package dependency, application code, database, backup, runtime credential, Windows setting or global Git/Codex configuration was changed.

## Design references: inspiration only

IBM, Cal and Linear are community analyses, not authorization to copy the brands. Use their hierarchy, spacing and component organization as inspiration only. Do not copy logos, proprietary fonts, marketing effects, scripts, CDN links or remote assets from their examples. Preserve the restaurant's content and the existing pt-BR/es translations, server rules and money formatting. The installed documents retain upstream examples as inert text; AGENTS.md defines their permitted use.

## Invocation and discovery

The project files match [Codex's documented repository discovery location](https://developers.openai.com/codex/skills): `.agents/skills/<name>/SKILL.md`. Each installed manifest has its expected name and description. In Codex CLI/IDE, invoke `$design-taste-frontend` or `$web-design-guidelines` (or select from `/skills`); the desktop selector can use `@`. The design references are ordinary documents, not separate skills.

The on-disk discovery structure and manifests are verified. The current chat's advertised skill inventory is not a live reload API, so actual selector visibility must be checked on the next turn; restart Codex if the skills do not appear. No unavailable helper scripts are invoked merely to check discovery.

## Installed payload hashes

| Project path | SHA-256 |
| --- | --- |
| `.agents/skills/design-taste-frontend/references/app-screens.md` | `84b4bd52e47e3f2b6a6e90767866e9a9059a99589e43544f5344d54bf5ae8b0c` |
| `.agents/skills/design-taste-frontend/references/colour.md` | `fa634ab3a4e0f9159b12c1d5450f708e1baec2d4285dd05999c758da9d70bbc1` |
| `.agents/skills/design-taste-frontend/references/copy.md` | `6de6cef4451a98660b4a4641d2c5f79f5281c18cd11016ef321d4a56e6c9cee2` |
| `.agents/skills/design-taste-frontend/references/critique.md` | `8fd1487c3ea43ba9877ab508db2833cc8dff7b59a2f962eb298ef0534598ed76` |
| `.agents/skills/design-taste-frontend/references/imagery.md` | `997e995bbd8e2d1b98b0c5b6c39baa992beb60abc33a8267585f15f70f1d6c15` |
| `.agents/skills/design-taste-frontend/references/layout.md` | `f14a8a9c1c58d98be971c803ffb8ef91cfc4e5a873ee888d9c7fceefa547e664` |
| `.agents/skills/design-taste-frontend/references/motion.md` | `52149b254d400513bf27d21e681e9c18bda806cbb04bbd0ace659bf1c454d213` |
| `.agents/skills/design-taste-frontend/references/research.md` | `b52b2939a2196c201b4e4b6811728c2a6e0c54c79b0a603db72456debc62b12a` |
| `.agents/skills/design-taste-frontend/references/scenes.md` | `765f1cc2b1e79e16a171737f8bdd47636d01c7d74ecd5a4b29cc5dedea3f6605` |
| `.agents/skills/design-taste-frontend/references/tells.md` | `a591b54f3a75722910f4c3dda5a420966f8b49a359628f30281929a8a91fe732` |
| `.agents/skills/design-taste-frontend/references/type.md` | `2419a8fb73ba97ae2ea81aa361a6ec6b95da64641fe1830e6937bb5b73f54168` |
| `.agents/skills/design-taste-frontend/SKILL.md` | `a2adda18568ae014f602e42b0727fb2e4b852f109d722b9f1e3067069d5c46ea` |
| `.agents/skills/design-taste-frontend/LICENSE` | `3c9f63518df3378772203cc64d38d9e381d2a4723b93d2c3849b2bf3d464de0c` |
| `.agents/skills/web-design-guidelines/SKILL.md` | `cabe92cca2564abf19b737c0999870da866d61cff23f7c83d206f9a5742ce049` |
| `.agents/skills/web-design-guidelines/command.md` | `d246b026f4f29b5823a9cc857f9edf3d2507002e055e32040cadeaf3b38e0234` |
| `docs/design-references/ibm/DESIGN.md` | `46f6fd65b5e7524fed1133b9b3c0dd619f9a0f145fbb2b87f3675c701a88f3bd` |
| `docs/design-references/cal/DESIGN.md` | `8cd21b7d67e94c899843d517f4b426e4fee33d47354a433d6a63ebcf79d5a654` |
| `docs/design-references/linear.app/DESIGN.md` | `30bd30e72c48a16e4bdbd010f2d1c85fab657c6fae3cc85389399aab10f9cb5f` |
| `docs/design-references/LICENSE` | `6d4bdc9a9cf30e7beb593475fdcdbf29f981ea6bd7923f202866145409f87b44` |
| `.agents/skills/web-design-guidelines/LICENSE-guidelines` | `6cd1609c9c12233507cdd2ce0d32e9a721e3c27494951be06b90090deeeb7af2` |

## Validation boundary

Installation checks passed for the branch, source commits/hashes, all 22 changed project paths, the text-only allowlist, absence of executable skill payloads, local Vercel rule binding, license preservation and both discovery manifests. `npm run check:text` passed with 559 UTF-8 files and zero issues; `git diff --check` passed. The temporary review directory was removed only after verifying its exact absolute path, ownership evidence and absence of reparse points. No application UI behavior changed, so no app/browser/database stack was started for this documentation-and-skill installation. No database, backup, secret, global installation, commit or push was touched.
