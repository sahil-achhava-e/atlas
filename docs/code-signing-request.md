# Request: Developer ID Application certificate for Atlas

## What I need

A **Developer ID Application** certificate, plus notarization credentials, so the
macOS app we build in house can be signed and notarized by Apple.

Not an "Apple Distribution" certificate, and not an App Store one. Developer ID is
the certificate type for apps distributed outside the Mac App Store, which is what
this is.

## Why

macOS refuses to open an unsigned app, and our endpoint policy blocks unsigned
binaries as well. Signing and notarizing is what makes the app launch normally on a
managed Mac. We have already confirmed this on my machine: a signed, notarized build
of the same codebase ran here without any exception being needed, while an unsigned
local build is killed on launch.

App details, for the record:

| | |
|---|---|
| App name | Atlas |
| Bundle identifier | `io.github.sahil-achhava-e.atlas` |
| Distribution | internal, direct download. Not the App Store |
| Platform | macOS, universal (Intel and Apple Silicon) |

## Step 1. Apple Developer Program membership

If your company already has an Apple Developer Program organization account, skip to
step 2 and tell me who the Account Holder is.

If not:

1. Enrol at <https://developer.apple.com/programs/enroll/> as an **organization**,
   not an individual.
2. Apple asks for a **D-U-N-S number** for the legal entity, a website on the
   company domain, and the legal entity name exactly as registered.
3. The enrolling Apple ID must have two factor authentication switched on.
4. Cost is 99 USD per year. Verification usually takes a few days.

The person who enrols becomes the **Account Holder**. This matters for step 2.

## Step 2. Create the certificate

**Only the Account Holder can create a Developer ID certificate.** Admin role is not
enough. This is an Apple restriction, not ours, so whoever holds that role has to do
this part or delegate it by signing in on the machine used for signing.

On the Mac that will build and sign the app:

1. Open **Keychain Access**.
2. Menu: **Keychain Access > Certificate Assistant > Request a Certificate From a
   Certificate Authority**.
3. Enter the Apple ID email of the account holder and a common name. Choose
   **Saved to disk**, and tick **Let me specify key pair information**. Leave the
   defaults: 2048 bits, RSA.
4. Save the `.certSigningRequest` file.

Then in the browser:

5. Go to <https://developer.apple.com/account/resources/certificates/list>.
6. Click **+**, choose **Developer ID Application**, continue.
7. Upload the `.certSigningRequest` file from step 4.
8. Download the resulting `.cer` file.
9. Double click the `.cer` to install it into the **login** keychain on the same Mac
   the CSR was created on. The private key only exists on that machine.

To confirm it worked, that Mac should show the identity here:

```bash
security find-identity -v -p codesigning
# expect a line like:
#   1) ABC123... "Developer ID Application: <Company Name> (TEAMID)"
```

Notes for whoever does this:

- An account is limited to **5 Developer ID Application certificates**. Do not
  revoke existing ones without checking what signs with them.
- The certificate is valid for 5 years. The private key cannot be recovered from
  Apple if lost, so export a backup (step 4 below).

## Step 3. Notarization credentials

Signing alone is not enough. Apple also has to notarize the build. Either option
works, and the App Store Connect key is the better one for automated builds because
it is not tied to a person.

**Option A, App Store Connect API key (preferred)**

1. <https://appstoreconnect.apple.com> > **Users and Access** > **Integrations** >
   **Keys**.
2. Generate a key with access level **Developer**.
3. Download the `.p8` file. **Apple allows this download only once.**
4. Note the **Key ID** and the **Issuer ID** shown on that page.

**Option B, app specific password**

1. <https://appleid.apple.com> > **Sign-In and Security** > **App-Specific
   Passwords** > generate one.
2. Note the Apple ID it belongs to, and the **Team ID** from
   <https://developer.apple.com/account> under Membership details.

## Step 4. For automated builds

If we build on CI rather than on a laptop, the certificate has to travel with the
job:

1. In Keychain Access, select the **Developer ID Application** certificate **and**
   its private key.
2. Right click > **Export 2 items**, save as `.p12`, and set a strong password.
3. Hand over the `.p12` and its password separately, through whatever the company
   uses for secrets. They go into the build as `CSC_LINK` and `CSC_KEY_PASSWORD`.

## What to hand back to me

- The certificate installed on the signing Mac, or the `.p12` file and its password.
- The **Team ID** (10 characters, from the Membership page).
- Either the `.p8` key file with its **Key ID** and **Issuer ID**, or the Apple ID
  and app specific password.

Nothing else is needed from IT. The build configuration on our side already expects
these and does nothing when they are absent, so today it simply produces an unsigned
build.
