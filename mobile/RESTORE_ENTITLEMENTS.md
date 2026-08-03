# Push Notifications & Apple Pay — temporarily disabled

Removed from `app.json` on 2026-08-03 because Apple blocks the Push
Notifications and Apple Pay (`merchantIdentifier`) entitlements on free
Personal development teams — `npx expo run:ios --device` failed with:

```
Cannot create a iOS App Development provisioning profile for "de.ichhabezeit.app".
Personal development teams... do not support the Apple Pay and Push
Notifications capabilities.
```

The app runs fine without them — `usePushNotifications.ts` already
catches push-token failures safely (bare-dev fallback), and Stripe
card payments work without Apple Pay.

## To restore, once on a paid Apple Developer Program account ($99/yr)

In `mobile/app.json`, change the `plugins` array back to:

```json
"plugins": [
  "expo-router",
  "expo-secure-store",
  [
    "expo-notifications",
    {
      "icon": "./assets/icon.png",
      "color": "#1A56DB"
    }
  ],
  [
    "@stripe/stripe-react-native",
    {
      "merchantIdentifier": "merchant.de.ichhabezeit",
      "enableGooglePay": false
    }
  ]
],
```

Then delete this file and re-run `npx expo run:ios --device` (or an EAS build).
