// Pure notification helpers shared by the dispatch-push Edge Function and Node tests.
// No Deno or network imports, so tests/notify/test.mjs can load this file directly.

export const NOTIFY_KINDS = ["sled", "article", "photo", "listing"];

export const SETTING_COL = {
  sled: "notify_sleds",
  article: "notify_articles",
  photo: "notify_photos",
  listing: "notify_listings",
};

export const DEFAULT_NOTIFY_SETTINGS = {
  notify_sleds: true,
  notify_articles: true,
  notify_photos: true,
  notify_listings: true,
  push_enabled: false,
};

export function isPremiumProfile(p, now = Date.now()) {
  if (!p) return false;
  if (p.is_admin || p.is_premium) return true;
  if (p.premium_until && Date.parse(p.premium_until) > now) return true;
  return false;
}

export function categoryEnabled(settings, kind) {
  const col = SETTING_COL[kind];
  if (!col) return false;
  if (!settings) return true;
  return settings[col] !== false;
}

// Who may receive a notice of this kind (membership gating). Signed-in free users
// get article notices only; sale / shared-sled / photo notices are members only.
export function canReceiveKind(profile, kind, now = Date.now()) {
  if (!profile) return false;
  if (kind === "article") return true;
  if (kind === "sled" || kind === "photo" || kind === "listing") return isPremiumProfile(profile, now);
  return false;
}

export function shouldNotifyUser(notification, profile, settings, now = Date.now()) {
  if (!notification || !profile) return false;
  if (notification.actor_id && notification.actor_id === profile.id) return false;
  if (notification.kind !== "article") {
    const actor = notification.actor_profile;
    if (actor && !isPremiumProfile(actor, now) && !notification.actor_is_premium) return false;
    if (notification.actor_is_premium === false) return false;
  }
  if (!canReceiveKind(profile, notification.kind, now)) return false;
  if (!categoryEnabled(settings, notification.kind)) return false;
  if (settings && settings.push_enabled === false) return false;
  return true;
}

export function recipientsForNotification(notification, users) {
  if (!notification || !Array.isArray(users)) return [];
  return users.filter((u) => shouldNotifyUser(notification, u.profile || u, u.settings, u.now));
}

export function pushPayload(notification) {
  const n = notification || {};
  return {
    title: n.title || "Sled Finder",
    body: n.body || "There's something new in Sled Finder.",
    href: n.href || "#/notifications",
    kind: n.kind || "",
    id: n.id || "",
  };
}
