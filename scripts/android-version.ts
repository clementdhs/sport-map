// Prints the Android version of a release tag for the release workflow (#337), as GitHub Actions outputs:
//   node --experimental-strip-types scripts/android-version.ts android-v1.2.3  →  name=1.2.3 / code=10203
// Runs with Node's type stripping (Node 22.6+), on the same function the site uses to compare versions.
import { androidVersionFromTag } from '../shared/utils/androidRelease.ts'

const tag = process.argv[2] ?? ''
const version = androidVersionFromTag(tag)
if (!version) {
  console.error(`Not an Android release tag: "${tag}" (expected android-vX.Y or android-vX.Y.Z, minor and patch under 100)`)
  process.exit(1)
}
console.log(`name=${version.name}`)
console.log(`code=${version.code}`)
