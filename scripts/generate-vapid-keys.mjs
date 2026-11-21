#!/usr/bin/env node
// Generate a VAPID key pair for Sled Finder Web Push (free, no paid service).
// Prints the public key (safe to put in config.js as VAPID_PUBLIC_KEY) and the
// private key (Supabase secret VAPID_PRIVATE_KEY only — never commit it or paste it in chat).
import { generateVapidKeys } from "../supabase/functions/_shared/webpush.mjs";

const keys = await generateVapidKeys();
console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
console.log("");
console.log("Put the public key in config.js (VAPID_PUBLIC_KEY).");
console.log("Set the private key as a Supabase secret, not in the repo:");
console.log("  supabase secrets set VAPID_PUBLIC_KEY='...' VAPID_PRIVATE_KEY='...' VAPID_SUBJECT='mailto:rbsledmuseum@gmail.com' PUSH_WEBHOOK_SECRET='(a long random string)'");
console.log("Do not commit the private key or paste it in chat.");
