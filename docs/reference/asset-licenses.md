# Asset license and attribution register

This register records evidence found in the repository. It does not convert credits, authorship, or repository presence into redistribution permission.

Release maintainers must treat every **Unresolved** entry as excluded from a public release unless explicit permission or an applicable license is recorded and reviewed.

## Bundled application asset

| Asset | Creator/source evidence | Modification status | License or redistribution evidence | Status |
|---|---|---|---|---|
| `app/assets/icon.png` | No repository-local provenance record found. | Unknown. | No repository-local license or permission record found. | **Unresolved** |

## Bundled pets

| Pet and assets | Creator/source evidence | Modification status | License or redistribution evidence | Status |
|---|---|---|---|---|
| `pets/eSheep-modern/animations.json`, `icon.png`, `spritesheet.png` | Header names Adriano and states “Image rip by LiL_Stenly,” with an eSheep project reference. | JSON conversion or modernization is apparent; exact asset modifications are not recorded. | No repository-local license text or permission record found. | **Unresolved** |
| `pets/eSheep-modern-debug/animations.xml`, `debug-sprites.png` | XML names Adriano and repeats the LiL_Stenly image credit. | Debug sprite variant; author, method, and source revision are not recorded. | No repository-local license text or permission record found. | **Unresolved** |
| `pets/eSheep-noir/animations.json`, `icon.png`, `spritesheet.png` | Header describes a Clod Pet black-and-white eSheep variant. | Modified derivative of eSheep assets; exact transformation and modifier are not recorded. | No repository-local license text or permission record found for the source or derivative. | **Unresolved** |
| `pets/esheep64/animations.xml`, `icon.png` and embedded assets | README credits Adriano Petrucci and says sprites came from LiL_Stenly at Sprite Database. | Unknown; XML contains embedded asset data. | Attribution exists, but no explicit license or redistribution permission is recorded. | **Unresolved** |

## Required record for a shippable asset

Each application or pet asset proposed for release must record:

- stable asset identity and repository path;
- creator and copyright holder, when known;
- original source and acquisition date;
- source revision, archive hash, or other stable evidence;
- applicable license or explicit permission;
- whether redistribution, modification, and commercial use are allowed;
- modification status and modifier;
- required attribution text and placement;
- whether source material must accompany the binary;
- reviewer and review date;
- package inclusion decision.

A URL or credit line alone is not sufficient evidence. Do not fetch replacement characters or sprite sheets from the internet during application startup.

## Custom pets

Users may load their own local pet definitions, but custom-pet support does not grant Clod Pet permission to redistribute those assets. A pull request adding a pet must include the required record above before its binary assets are accepted.

Pet documents should eventually carry structured attribution fields after an owner-approved schema-version migration. Until then, this register remains the release authority for bundled assets.

## Current release conclusion

The repository contains useful attribution clues, but the bundled asset set is not cleared for a publisher-signed public release by this review. No asset was added, removed, relicensed, published, or signed in the privileged-boundary hardening pull request.
