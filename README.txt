PLATE — food & macro log (v1.3, with friends)
================================================

WHAT'S NEW IN 1.5
- Record workouts in the Lift tab: weights, reps and sets as you go, with last time's numbers beside you
  and a rest timer. A workout saves itself as you go and can be picked back up after a reload or lost signal.
- The app opens faster on a weak signal. If the network hasn't answered in 3 seconds it uses the saved copy.
- The rest alert only plays while the app is open. If the phone is locked, the timer will be right when
  you come back, but it can't alert you.

WHAT'S NEW IN 1.4
- Lift tab: an exercise library you can search and filter, your own custom exercises, and a routine
  builder with templates to copy. No database setup needed: it saves to your account like your food log.
  Exercise instructions are general guidance, not medical advice.

WHAT'S NEW IN 1.3
- A brighter, more modern look, in both light and dark mode. Nothing about your data changes.

WHAT'S NEW IN 1.2
- Friends tab: pick a username, add friends by username, and view each other's food diaries.
- A friend request has to be accepted before anything is shared. Removing a friend stops sharing
  right away. Friends see your diary and daily targets only, not your saved foods, saved meals,
  email or other settings.

ADDING FRIENDS TO AN EXISTING SETUP (2 minutes)
1. Supabase > SQL Editor > New query. Open supabase-friends.sql from this folder, copy ALL of it,
   paste it in and click Run. You should see "Success. No rows returned".
   Your existing logs and the rules protecting them aren't changed.
2. Copy these files into your GitHub Desktop folder (replace the old ones), commit and push.
3. If you turned off "Allow new users to sign up" (step 9 below), your friends can't create
   accounts until you turn it back on. It's fine to turn it off again once they've joined.
   The built-in email sender only allows a few emails per hour, so have people sign up a few at a time.

WHAT'S NEW IN 1.1
- Sign-in screen with email + password, like MyFitnessPal. Each person has their own private account.
- Your log is saved to your account and synced, so it survives a lost phone and you can sign in on
  any device. It still works with no signal and syncs when you're back online.
- A log you already started in v1 is uploaded to your account the first time you sign in.

ONE-TIME CLOUD SETUP (about 10 minutes, free)
1. Go to https://supabase.com, click "Start your project" and sign in with your GitHub account.
2. New project: name it "plate", create a database password (save it somewhere; the app doesn't
   need it), pick region "East US", then create the project and wait about 2 minutes for it to start.
3. Left menu > SQL Editor > New query. Open supabase-setup.sql from this folder, copy ALL of it,
   paste it in and click Run. You should see "Success. No rows returned".
   Then do the same with supabase-friends.sql.
4. Left menu > Authentication > URL Configuration:
     Site URL:       https://tlmackin.github.io/plate/
     Redirect URLs:  add https://tlmackin.github.io/plate/
   (This is where the "confirm your email" and "reset password" links send you.)
5. Click "Connect" at the top of the dashboard (or Project Settings > API Keys / Data API) and copy:
     - the Project URL         (looks like https://abcdefghij.supabase.co)
     - the anon / publishable key  (starts with "eyJ..." or "sb_publishable_...")
   Do NOT use the "service_role" or "secret" key — that one must never go in the app.
6. Open config.js in this folder and paste them between the quotes:
     supabaseUrl: 'https://abcdefghij.supabase.co',
     supabaseAnonKey: 'eyJ...',
   Publishing these two values is normal and safe; the database rules from step 3 keep each
   person's log private.
7. Copy all of these files into your GitHub Desktop folder (replace the old ones), commit and push.
8. On each phone, open the app, tap "Create an account", then tap the link in the confirmation email.
   Use a different email for each person.
9. Once you both have accounts: Authentication > Sign In / Providers > turn OFF
   "Allow new users to sign up". Then strangers who find the link can't create accounts.

GOOD TO KNOW
- Free Supabase projects pause after about a week with no activity. Daily logging keeps it active.
  If it ever pauses, Supabase emails you; click Restore in the dashboard. Your data is kept.
- The built-in email sender only allows a few emails per hour, which is plenty for two people.
  If a confirmation email doesn't arrive, check spam and wait a few minutes before trying again.
- Signing out removes the log from that phone (it stays in the account). Signing in again brings it back.
- Settings > Download backup still gives you your own copy as a file anytime.
- Testing on a Netlify preview link: sign-in works there too. For email links to open the preview,
  add  https://*--YOUR-NETLIFY-SITE.netlify.app/**  to Redirect URLs in step 4.

INSTALL ON EACH PHONE
iPhone:  open the link in Safari > Share > "Add to Home Screen".
Android: open the link in Chrome > ⋮ menu > "Install app".

WEEKLY REPORT
Report tab > pick the week > "PDF report" or "Spreadsheet (CSV)" > share sheet > save or send,
then attach it in Nourish the way your dietitian prefers.

FILES
index.html, app.js, core.js, styles.css  the app
lift.js, lift-core.js, exercises.js      the Lift tab and its exercise library
tests/                                   automated checks, not used by the app itself
config.js                                your Supabase settings (step 6)
supabase-setup.sql                       database setup (step 3), not used by the app itself
supabase-friends.sql                     database setup for friends, run once after supabase-setup.sql
sw.js, manifest.webmanifest, icons/      what makes it installable and work offline
lib/                                     barcode scanner, PDF maker, Supabase client
fonts/                                   the app's font (Plus Jakarta Sans, Open Font License)
