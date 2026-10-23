# Launch checklist

Everything here is done once. Steps marked **(Martin)** need your accounts or
passwords; the rest Claude can do.

## 1. Email first (so nothing goes down)

1. **(Martin)** Create a free Zoho Mail account for martingawlakcompany.com with
   `hello@` and `martin@`, and turn on two-step login for both.
2. Copy old mail from SiteGround into Zoho.
3. **(Martin)** Point the domain's MX records at Zoho, and add Zoho's SPF, DKIM and
   DMARC records. Keep SiteGround running until mail has worked for a week.

## 2. Cloudflare

1. **(Martin)** Create a free Cloudflare account and add martingawlakcompany.com
   (and each brand domain). Cloudflare copies the existing DNS records; check the
   mail records came across before switching nameservers at the registrar.
2. Create the accounts database:
   `npx wrangler d1 create mgc-accounts`, put the id in `apps/accounts/wrangler.toml`,
   then `npm run db:migrate -w @mgc/accounts`.

## 3. Sending email from the sites (sign-in codes, contact form)

1. **(Martin)** Create a free Resend account and verify martingawlakcompany.com there
   (it gives you DNS records to add in Cloudflare).
2. Add the Resend API key as `RESEND_API_KEY` on both the accounts Worker and the site.

## 4. Accounts service

```bash
cd apps/accounts
npx wrangler secret put BETTER_AUTH_SECRET   # openssl rand -base64 32
npx wrangler secret put RESEND_API_KEY
npm run deploy
```

Optional sign-in methods (each shows up on the sign-in page once its keys are set):

- **Privy:** create an app at privy.io, enable email, wallet, Google and Apple,
  require an email, and add `accounts.martingawlakcompany.com` as an allowed domain.
  Set `PRIVY_APP_ID` and `PRIVY_VERIFICATION_KEY` (the PEM "verification key").
- **Google:** OAuth client with redirect
  `https://accounts.martingawlakcompany.com/api/auth/callback/google`; set
  `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- **Apple:** Services ID with return URL
  `https://accounts.martingawlakcompany.com/api/auth/callback/apple`; set
  `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET` and `APPLE_APP_BUNDLE_IDENTIFIER`.

Then sign in at https://accounts.martingawlakcompany.com with
hello@martingawlakcompany.com (that makes it the admin), open **Admin**, and click
**Create sign-in credentials for brand sites**. Copy each site's client id and
secret; they are only shown once.

## 5. Main site

```bash
cd apps/martingawlakcompany
npx wrangler pages project create martingawlakcompany
npx wrangler pages secret put STRIPE_SECRET_KEY   # Stripe dashboard → Developers → API keys
npx wrangler pages secret put SSO_CLIENT_ID
npx wrangler pages secret put SSO_CLIENT_SECRET
npx wrangler pages secret put SESSION_SECRET      # openssl rand -base64 32
npx wrangler pages secret put RESEND_API_KEY
npm run deploy
```

Test on the `*.pages.dev` address: browse pages, buy something in Stripe test mode,
send the contact form, sign in and out. Then add `martingawlakcompany.com` as the
project's custom domain.

## 6. After launch

- Keep the SiteGround site for two weeks as a fallback, then cancel.
- Delete the WordPress backup from Google Drive once you no longer need it. It
  contains a database password and the old plugin's wallet key.
