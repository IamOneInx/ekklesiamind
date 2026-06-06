# ekklēsiaMind / ekklēsia Ministry Driver Project Status

Last updated: 2026-06-05 22:48:42 EDT

## Project Location

Active local project folder:

- `D:\Projects\Q\ekklesiamind`

Old C: project folder was moved/renamed and should not be used as the active project.

## Live Deployment

Firebase Hosting is deployed and working.

Live URLs:

- https://ekklesiamind.web.app
- https://ekklesiamind.com
- https://www.ekklesiamind.com
- https://ekklesiamind.org
- https://www.ekklesiamind.org

Cloudflare DNS records for the `.com`, `www.com`, `.org`, and `www.org` domains were added as DNS-only records for Firebase Hosting validation and SSL.

## GitHub

GitHub repo:

- https://github.com/IamOneInx/ekklesiamind

Main branch is pushed and tracking `origin/main`.

Recent important commits:

- `7191d52` — `[verified] Show taxi savings on trip receipts`
- `31d3b19` — `[verified] Lock taxi base fare setting`

## Security Work Completed

Added GitHub security automation:

- Dependabot configuration
- GitHub Security and CI workflow
- npm dependency audits
- lint checks
- tests
- production build check
- CodeQL security scan
- GitHub vulnerability alerts
- automated security fixes
- pinned GitHub Actions by commit SHA

Validation results from the latest work:

- `npm audit`: 0 vulnerabilities
- lint: passed
- tests: 11 passed
- build: passed
- GitHub CI: passed
- CodeQL security scan: passed

## Receipt / Taxi Savings Changes

Trip Receipt now shows the neighbor how much they are saving compared with an estimated regular taxi fare.

Receipt now includes:

- Estimated taxi fare
- Suggested donation
- Estimated savings
- Donations are voluntary

Example shown after the change:

```text
Estimated taxi fare: $99.50
Suggested donation: $24.00
Estimated savings: $75.50
```

The app calculates taxi fare using a fixed app-controlled base fare plus configurable taxi mileage and wait rates.

Drivers should **not** be able to change the taxi base fare. That setting was removed from the dashboard. The UI now says:

```text
Taxi base fare is fixed by the app.
```

Drivers can still edit:

- mileage rate for suggested donation
- waiting/service rate for suggested donation
- waiting/service hours
- taxi mileage rate
- taxi hourly wait rate
- optional extra fees

## Sign-In / Sign-Up UI

Added visible buttons in the member area:

- Sign Up
- Sign In

These are currently UI buttons/placeholders and still need to be wired to real authentication later.

## App Hosting Status

Regular Firebase Hosting is live and should be treated as production for now.

Firebase App Hosting backend exists but is not the active deployed path yet. It still needs GitHub/App Hosting connection and rollout if we decide to use that pipeline later.

## Important Notes

- Do not print or commit API keys, tokens, or secrets.
- Cloudflare tokens were used only for DNS setup and should remain redacted.
- Keep active project work under `D:\Projects`.
- Preferred app wording: use `Trip`, `Start Trip`, and `Schedule Apt` in the UI.
- `Ekklesia MinD` is an acceptable playful nickname/brand twist for ekklēsiaMind / Ministry Driver.
